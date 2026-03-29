/**
 * Core WebDriver + BiDi connection management
 */

import { Builder, Browser } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { FirefoxLaunchOptions } from './types.js';
import { log, logDebug } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Shared driver interface — the minimal surface used by all consumers
// (DomInteractions, PageManagement, SnapshotManager, UidResolver).
// Both selenium WebDriver and GeckodriverHttpDriver satisfy this contract.
// ---------------------------------------------------------------------------

export interface IElement {
  click(): Promise<void>;
  clear(): Promise<void>;
  sendKeys(...args: Array<string | number>): Promise<void>;
  isDisplayed(): Promise<boolean>;
  takeScreenshot(): Promise<string>;
}

export interface IBiDiSocket {
  readyState: number;
  on(event: string, listener: (data: unknown) => void): void;
  off(event: string, listener: (data: unknown) => void): void;
  send(data: string): void;
}

export interface IBiDi {
  socket: IBiDiSocket;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IDriver {
  getTitle(): Promise<string>;
  getCurrentUrl(): Promise<string>;
  getWindowHandle(): Promise<string>;
  getAllWindowHandles(): Promise<string[]>;
  get(url: string): Promise<void>;
  getPageSource(): Promise<string>;
  executeScript<T>(script: string | ((...a: any[]) => any), ...args: unknown[]): Promise<T>;
  executeAsyncScript<T>(script: string | ((...a: any[]) => any), ...args: unknown[]): Promise<T>;
  takeScreenshot(): Promise<string>;
  close(): Promise<void>;
  findElement(locator: any): Promise<IElement>;
  switchTo(): {
    window(handle: string): Promise<void>;
    newWindow(type: string): Promise<{ handle: string }>;
    alert(): Promise<{
      accept(): Promise<void>;
      dismiss(): Promise<void>;
      getText(): Promise<string>;
      sendKeys(text: string): Promise<void>;
    }>;
  };
  navigate(): {
    back(): Promise<void>;
    forward(): Promise<void>;
    refresh(): Promise<void>;
  };
  manage(): {
    window(): {
      setRect(rect: { width: number; height: number }): Promise<void>;
    };
  };
  actions(opts?: { async?: boolean }): {
    move(opts: { x?: number; y?: number; origin?: unknown }): any;
    click(): any;
    doubleClick(el?: unknown): any;
    perform(): Promise<void>;
    clear(): Promise<void>;
  };
  getBidi(): Promise<IBiDi>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// GeckodriverElement — wraps a raw WebDriver element reference for HTTP API
// ---------------------------------------------------------------------------

class GeckodriverElement implements IElement {
  constructor(
    private cmd: (method: string, path: string, body?: unknown) => Promise<unknown>,
    private elementId: string
  ) {}

  async click(): Promise<void> {
    await this.cmd('POST', `/element/${this.elementId}/click`, {});
  }

  async clear(): Promise<void> {
    await this.cmd('POST', `/element/${this.elementId}/clear`, {});
  }

  async sendKeys(...args: Array<string | number>): Promise<void> {
    const text = args.join('');
    await this.cmd('POST', `/element/${this.elementId}/value`, { text });
  }

  async isDisplayed(): Promise<boolean> {
    return (await this.cmd('GET', `/element/${this.elementId}/displayed`)) as boolean;
  }

  async takeScreenshot(): Promise<string> {
    return (await this.cmd('GET', `/element/${this.elementId}/screenshot`)) as string;
  }
}

// ---------------------------------------------------------------------------
// GeckodriverHttpDriver
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around geckodriver HTTP API that implements the subset of
 * WebDriver interface used by firefox-devtools-mcp.
 *
 * This exists because selenium-webdriver's Driver.createSession() tries to
 * auto-upgrade to BiDi WebSocket, which hangs when connecting to an existing
 * Firefox instance. By talking directly to geckodriver's HTTP API we avoid
 * the BiDi issue entirely.
 */
class GeckodriverHttpDriver implements IDriver {
  private baseUrl: string;
  private sessionId: string;
  private gdProcess: ChildProcess;
  private webSocketUrl: string | null;
  private bidiConnection: IBiDi | null = null;

  constructor(baseUrl: string, sessionId: string, gdProcess: ChildProcess, webSocketUrl: string | null) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.gdProcess = gdProcess;
    this.webSocketUrl = webSocketUrl;
  }

  static async connect(marionettePort: number, marionetteHost = '127.0.0.1'): Promise<GeckodriverHttpDriver> {
    // Find geckodriver binary via selenium-manager
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');

    let geckodriverPath: string;
    try {
      // selenium-manager ships with selenium-webdriver and resolves/downloads geckodriver.
      // Use --driver instead of --browser to skip downloading Firefox, which is
      // already running externally in connect-existing mode.
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      const swPkg = require.resolve('selenium-webdriver/package.json');
      const swDir = path.dirname(swPkg);
      const platform =
        process.platform === 'win32'
          ? 'windows'
          : process.platform === 'darwin'
            ? 'macos'
            : 'linux';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const smBin = path.join(swDir, 'bin', platform, `selenium-manager${ext}`);
      const result = JSON.parse(
        execFileSync(smBin, ['--driver', 'geckodriver', '--output', 'json'], { encoding: 'utf-8' })
      );
      geckodriverPath = result.result.driver_path;
    } catch {
      // Fallback: walk the selenium cache directory to find any geckodriver binary
      const os = await import('node:os');
      const fs = await import('node:fs');
      const cacheBase = path.join(os.homedir(), '.cache/selenium/geckodriver');
      geckodriverPath = findGeckodriverInCache(fs, path, cacheBase);
      if (!geckodriverPath) {
        throw new Error('Cannot find geckodriver binary. Ensure selenium-webdriver is installed.');
      }
    }
    logDebug(`Using geckodriver: ${geckodriverPath}`);

    // Use --port=0 to let the OS assign a free port atomically (geckodriver ≥0.34.0)
    const gd = spawn(
      geckodriverPath,
      ['--connect-existing', '--marionette-host', marionetteHost, '--marionette-port', String(marionettePort), '--port', '0'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    // Wait for geckodriver to start listening and extract the assigned port
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Geckodriver startup timeout')), 10000);
      const onData = (data: Buffer) => {
        const msg = data.toString();
        logDebug(`[geckodriver] ${msg.trim()}`);
        const match = msg.match(/Listening on\s+\S+:(\d+)/);
        if (match?.[1]) {
          clearTimeout(timeout);
          resolve(parseInt(match[1], 10));
        }
      };
      // Listen on both stdout and stderr — geckodriver's output stream varies by version/platform
      gd.stdout?.on('data', onData);
      gd.stderr?.on('data', onData);
      gd.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      gd.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Geckodriver exited with code ${code}`));
      });
    });

    const baseUrl = `http://127.0.0.1:${port}`;

    // Create a WebDriver session with BiDi opt-in
    const resp = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: { webSocketUrl: true } } }),
    });
    const json = (await resp.json()) as {
      value: { sessionId: string; capabilities: Record<string, unknown> };
    };
    if (!json.value?.sessionId) {
      throw new Error(`Failed to create session: ${JSON.stringify(json)}`);
    }

    let wsUrl = json.value.capabilities.webSocketUrl as string | undefined;
    logDebug(`Session capabilities webSocketUrl: ${wsUrl ?? 'not present'}, marionetteHost: ${marionetteHost}`);
    if (wsUrl && marionetteHost !== '127.0.0.1') {
      // Rewrite the URL to connect through the remote host / tunnel.
      const parsed = new URL(wsUrl);
      parsed.hostname = marionetteHost;
      wsUrl = parsed.toString();
    }
    if (wsUrl) {
      logDebug(`BiDi WebSocket URL: ${wsUrl}`);
    } else {
      logDebug('BiDi WebSocket URL not available (Firefox may not support it or Remote Agent is not running)');
    }

    return new GeckodriverHttpDriver(baseUrl, json.value.sessionId, gd, wsUrl ?? null);
  }

  private async cmd(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}/session/${this.sessionId}${path}`;
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(url, opts);
    const json = (await resp.json()) as { value: unknown };
    if (json.value && typeof json.value === 'object' && 'error' in json.value) {
      const err = json.value as Record<string, string>;
      throw new Error(`${err.error}: ${err.message}`);
    }
    return json.value;
  }

  // WebDriver-compatible methods used by the rest of the codebase
  async getTitle(): Promise<string> {
    return (await this.cmd('GET', '/title')) as string;
  }
  async getCurrentUrl(): Promise<string> {
    return (await this.cmd('GET', '/url')) as string;
  }
  async getWindowHandle(): Promise<string> {
    return (await this.cmd('GET', '/window')) as string;
  }
  async getAllWindowHandles(): Promise<string[]> {
    return (await this.cmd('GET', '/window/handles')) as string[];
  }
  async get(url: string): Promise<void> {
    await this.cmd('POST', '/url', { url });
  }
  async getPageSource(): Promise<string> {
    return (await this.cmd('GET', '/source')) as string;
  }
  async executeScript<T>(script: string, ...args: unknown[]): Promise<T> {
    return (await this.cmd('POST', '/execute/sync', { script, args })) as T;
  }
  async executeAsyncScript<T>(script: string, ...args: unknown[]): Promise<T> {
    return (await this.cmd('POST', '/execute/async', { script, args })) as T;
  }
  async takeScreenshot(): Promise<string> {
    return (await this.cmd('GET', '/screenshot')) as string;
  }
  async close(): Promise<void> {
    await this.cmd('DELETE', '/window');
  }
  async getSession(): Promise<{ getId(): string }> {
    return { getId: () => this.sessionId };
  }

  // Element finding
  async findElement(locator: Record<string, unknown>): Promise<GeckodriverElement> {
    // Accept selenium By objects (which have using/value) and raw {using, value} objects
    const loc = locator as { using?: string; value?: string };
    const using = loc.using ?? 'css selector';
    const value = loc.value ?? '';
    const result = (await this.cmd('POST', '/element', { using, value })) as Record<string, string>;
    // WebDriver protocol returns { "element-xxx": "id" } or { ELEMENT: "id" }
    const elementId = Object.values(result)[0]!;
    return new GeckodriverElement(this.cmd.bind(this), elementId);
  }

  async findElements(locator: Record<string, unknown>): Promise<GeckodriverElement[]> {
    const loc = locator as { using?: string; value?: string };
    const using = loc.using ?? 'css selector';
    const value = loc.value ?? '';
    const results = (await this.cmd('POST', '/elements', { using, value })) as Array<
      Record<string, string>
    >;
    return results.map((r) => new GeckodriverElement(this.cmd.bind(this), Object.values(r)[0]!));
  }

  // Polling wait — compatible with selenium's Condition objects and plain functions.
  // Used by dom.ts helpers for element location and visibility polling.
  async wait<T>(
    condition:
      | { fn: (driver: any) => T | Promise<T | null> | null }
      | ((driver: any) => T | Promise<T | null> | null),
    timeout = 5000
  ): Promise<T> {
    const fn = typeof condition === 'function' ? condition : condition.fn;
    const deadline = Date.now() + timeout;
    let lastError: Error | undefined;
    while (Date.now() < deadline) {
      try {
        const result = await fn(this);
        if (result) {
          return result;
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw lastError ?? new Error(`wait() timed out after ${timeout}ms`);
  }

  switchTo() {
    return {
      window: async (handle: string): Promise<void> => {
        await this.cmd('POST', '/window', { handle });
      },
      newWindow: async (type: string): Promise<{ handle: string }> => {
        return (await this.cmd('POST', '/window/new', { type })) as { handle: string };
      },
      alert: async () => {
        return {
          accept: async (): Promise<void> => {
            await this.cmd('POST', '/alert/accept');
          },
          dismiss: async (): Promise<void> => {
            await this.cmd('POST', '/alert/dismiss');
          },
          getText: async (): Promise<string> => {
            return (await this.cmd('GET', '/alert/text')) as string;
          },
          sendKeys: async (text: string): Promise<void> => {
            await this.cmd('POST', '/alert/text', { text });
          },
        };
      },
    };
  }

  navigate() {
    return {
      back: async (): Promise<void> => {
        await this.cmd('POST', '/back');
      },
      forward: async (): Promise<void> => {
        await this.cmd('POST', '/forward');
      },
      refresh: async (): Promise<void> => {
        await this.cmd('POST', '/refresh');
      },
    };
  }

  manage() {
    return {
      window: () => {
        return {
          setRect: async (rect: { width: number; height: number }): Promise<void> => {
            await this.cmd('POST', '/window/rect', rect);
          },
        };
      },
    };
  }

  actions(_opts?: { async?: boolean }) {
    // Accumulate action sequences for the W3C Actions API
    const actionSequences: unknown[] = [];
    const builder = {
      move: (opts: { x?: number; y?: number; origin?: unknown }) => {
        actionSequences.push({
          type: 'pointer',
          id: 'mouse',
          parameters: { pointerType: 'mouse' },
          actions: [{ type: 'pointerMove', ...opts }],
        });
        return builder;
      },
      click: () => {
        const last = actionSequences[actionSequences.length - 1] as
          | { actions: unknown[] }
          | undefined;
        if (last) {
          last.actions.push({ type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 });
        }
        return builder;
      },
      doubleClick: (_el?: unknown) => {
        const last = actionSequences[actionSequences.length - 1] as
          | { actions: unknown[] }
          | undefined;
        if (last) {
          last.actions.push(
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 }
          );
        }
        return builder;
      },
      perform: async (): Promise<void> => {
        await this.cmd('POST', '/actions', { actions: actionSequences });
      },
      clear: async (): Promise<void> => {
        await this.cmd('DELETE', '/actions');
      },
    };
    return builder;
  }

  async quit(): Promise<void> {
    if (this.bidiConnection) {
      (this.bidiConnection.socket as unknown as WebSocket).close();
      this.bidiConnection = null;
    }
    try {
      await this.cmd('DELETE', '');
    } catch {
      // ignore
    }
    this.gdProcess.kill();
  }

  /** Kill the geckodriver process without closing Firefox.
   *  Deletes the session first so Marionette accepts new connections. */
  async kill(): Promise<void> {
    if (this.bidiConnection) {
      (this.bidiConnection.socket as unknown as WebSocket).close();
      this.bidiConnection = null;
    }
    try {
      await this.cmd('DELETE', '');
    } catch {
      // ignore
    }
    this.gdProcess.kill();
  }

  /**
   * Return a BiDi handle. Opens a WebSocket to Firefox's Remote Agent on
   * first call, using the webSocketUrl returned in the session capabilities.
   */
  async getBidi(): Promise<IBiDi> {
    if (this.bidiConnection) return this.bidiConnection;
    if (!this.webSocketUrl) {
      throw new Error(
        'BiDi is not available: no webSocketUrl in session capabilities. ' +
        'Ensure Firefox was started with --remote-debugging-port.'
      );
    }

    const ws = new WebSocket(this.webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (e: any) => {
        const msg = e?.message || e?.error?.message || e?.error || e?.type || JSON.stringify(e) || String(e);
        reject(new Error(`BiDi WS to ${this.webSocketUrl}: ${msg}`));
      });
    });

    let cmdId = 0;
    const subscribe = async (event: string, contexts?: string[]): Promise<void> => {
      const msg: Record<string, unknown> = {
        id: ++cmdId,
        method: 'session.subscribe',
        params: { events: [event] },
      };
      if (contexts) msg.params = { events: [event], contexts };
      ws.send(JSON.stringify(msg));
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`BiDi subscribe timeout for ${event}`)), 5000);
        const onMsg = (data: WebSocket.Data) => {
          try {
            const payload = JSON.parse(data.toString());
            if (payload.id === cmdId) {
              clearTimeout(timeout);
              ws.off('message', onMsg);
              if (payload.error) {
                reject(new Error(`BiDi subscribe error: ${payload.error}`));
              } else {
                resolve();
              }
            }
          } catch { /* ignore parse errors from event messages */ }
        };
        ws.on('message', onMsg);
      });
      logDebug(`BiDi subscribed to ${event}`);
    };

    this.bidiConnection = { subscribe, socket: ws as unknown as IBiDiSocket } as any;
    return this.bidiConnection;
  }
}

// ---------------------------------------------------------------------------
// Geckodriver cache walker — finds any geckodriver binary cross-platform
// ---------------------------------------------------------------------------

function findGeckodriverInCache(
  fs: typeof import('node:fs'),
  path: typeof import('node:path'),
  cacheBase: string
): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `geckodriver${ext}`;

  try {
    if (!fs.existsSync(cacheBase)) {
      return '';
    }

    // Walk: cacheBase/<platform>/<version>/geckodriver[.exe]
    for (const platformDir of fs.readdirSync(cacheBase)) {
      const platformPath = path.join(cacheBase, platformDir);
      if (!fs.statSync(platformPath).isDirectory()) {
        continue;
      }

      // Sort version dirs descending so we prefer the newest
      const versionDirs = fs.readdirSync(platformPath).sort().reverse();
      for (const versionDir of versionDirs) {
        const candidate = path.join(platformPath, versionDir, binaryName);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Ignore permission errors etc.
  }
  return '';
}

export class FirefoxCore {
  private driver: IDriver | null = null;
  private currentContextId: string | null = null;
  private originalEnv: Record<string, string | undefined> = {};
  private logFilePath: string | undefined;
  private logFileFd: number | undefined;

  constructor(private options: FirefoxLaunchOptions) {}

  /**
   * Launch Firefox (or connect to an existing instance) and establish BiDi connection
   */
  async connect(): Promise<void> {
    if (this.options.connectExisting) {
      log('🔗 Connecting to existing Firefox via Marionette...');
    } else {
      log('🚀 Launching Firefox via Selenium WebDriver BiDi...');
    }

    if (this.options.connectExisting) {
      // Connect to existing Firefox via geckodriver HTTP API directly.
      // We bypass selenium-webdriver because its BiDi auto-upgrade hangs
      // when used with geckodriver's --connect-existing mode.
      const port = this.options.marionettePort ?? 2828;
      const host = this.options.marionetteHost ?? '127.0.0.1';
      this.driver = await GeckodriverHttpDriver.connect(port, host);
    } else {
      // Set up output file for capturing Firefox stdout/stderr
      if (this.options.logFile) {
        this.logFilePath = this.options.logFile;
      } else if (this.options.env && Object.keys(this.options.env).length > 0) {
        const outputDir = join(homedir(), '.firefox-devtools-mcp', 'output');
        mkdirSync(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFilePath = join(outputDir, `firefox-${timestamp}.log`);
      }

      // Set environment variables (will be inherited by geckodriver -> Firefox)
      if (this.options.env) {
        for (const [key, value] of Object.entries(this.options.env)) {
          this.originalEnv[key] = process.env[key];
          process.env[key] = value;
          logDebug(`Set env ${key}=${value}`);
        }

        // Important: Do NOT set MOZ_LOG_FILE - MOZ_LOG writes to stderr by default
        // We capture stderr directly through file descriptor redirection
        if (this.options.env.MOZ_LOG_FILE) {
          logDebug('Note: MOZ_LOG_FILE in env will be used, but may be blocked by sandbox');
        }
      }

      // Standard path: launch a new Firefox via selenium-webdriver
      const firefoxOptions = new firefox.Options();
      firefoxOptions.enableBidi();

      if (this.options.headless) {
        firefoxOptions.addArguments('-headless');
      }
      if (this.options.viewport) {
        firefoxOptions.windowSize({
          width: this.options.viewport.width,
          height: this.options.viewport.height,
        });
      }
      if (this.options.firefoxPath) {
        firefoxOptions.setBinary(this.options.firefoxPath);
      }
      if (this.options.args && this.options.args.length > 0) {
        firefoxOptions.addArguments(...this.options.args);
      }
      if (this.options.profilePath) {
        // Use Firefox's native --profile argument for reliable profile loading
        // (Selenium's setProfile() copies to temp dir which can be unreliable)
        firefoxOptions.addArguments('--profile', this.options.profilePath);
        log(`📁 Using Firefox profile: ${this.options.profilePath}`);
      }
      if (this.options.acceptInsecureCerts) {
        firefoxOptions.setAcceptInsecureCerts(true);
      }
      if (this.options.prefs) {
        for (const [name, value] of Object.entries(this.options.prefs)) {
          firefoxOptions.setPreference(name, value);
        }
      }

      // Configure geckodriver service to capture output
      const serviceBuilder = new firefox.ServiceBuilder();

      // If we have a log file, open it and redirect geckodriver output there
      // This captures both geckodriver logs and Firefox stderr (including MOZ_LOG)
      if (this.logFilePath) {
        // Open file for appending, create if doesn't exist
        this.logFileFd = openSync(this.logFilePath, 'a');

        // Configure stdio: stdin=ignore, stdout=logfile, stderr=logfile
        // This redirects all output from geckodriver and Firefox to the log file
        serviceBuilder.setStdio(['ignore', this.logFileFd, this.logFileFd]);

        log(`📝 Capturing Firefox output to: ${this.logFilePath}`);
      }

      // selenium WebDriver satisfies IDriver structurally at runtime
      this.driver = (await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(firefoxOptions)
        .setFirefoxService(serviceBuilder)
        .build()) as unknown as IDriver;
    }

    log(
      this.options.connectExisting
        ? '✅ Connected to existing Firefox'
        : '✅ Firefox launched with BiDi'
    );

    // Remember current window handle (browsing context)
    this.currentContextId = await this.driver.getWindowHandle();
    logDebug(`Browsing context ID: ${this.currentContextId}`);

    // Navigate if startUrl provided (skip for connectExisting to not disrupt the user's browsing)
    if (this.options.startUrl && !this.options.connectExisting) {
      await this.driver.get(this.options.startUrl);
      logDebug(`Navigated to: ${this.options.startUrl}`);
    }

    log('✅ Firefox DevTools ready');
  }

  /**
   * Get driver instance (throw if not connected)
   */
  getDriver(): IDriver {
    if (!this.driver) {
      throw new Error('Driver not connected');
    }
    return this.driver;
  }

  /**
   * Check if Firefox is still connected and responsive
   * Returns false if Firefox was closed or connection is broken
   */
  async isConnected(): Promise<boolean> {
    if (!this.driver) {
      return false;
    }

    try {
      await this.driver.getWindowHandle();
      return true;
    } catch (error) {
      logDebug('Connection check failed: Firefox is not responsive');
      return false;
    }
  }

  /**
   * Reset driver state (used when Firefox is detected as closed)
   */
  reset(): void {
    if (this.driver && this.options.connectExisting && 'kill' in this.driver) {
      (this.driver as { kill(): Promise<void> }).kill();
    }
    this.driver = null;
    this.currentContextId = null;
    logDebug('Driver state reset');
  }

  /**
   * Get current browsing context ID
   */
  getCurrentContextId(): string | null {
    return this.currentContextId;
  }

  /**
   * Update current context ID (used by page management)
   */
  setCurrentContextId(contextId: string): void {
    this.currentContextId = contextId;
  }

  /**
   * Get log file path
   */
  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Get current launch options
   */
  getOptions(): FirefoxLaunchOptions {
    return this.options;
  }

  /**
   * Wait for WebSocket to be in OPEN state
   */
  private async waitForWebSocketOpen(ws: any, timeout: number = 5000): Promise<void> {
    // Already open
    if (ws.readyState === 1) {
      return;
    }

    // Still connecting - wait for open event with timeout
    if (ws.readyState === 0) {
      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          ws.off('open', onOpen);
          reject(new Error('Timeout waiting for WebSocket to open'));
        }, timeout);

        const onOpen = () => {
          clearTimeout(timeoutId);
          ws.off('open', onOpen);
          resolve();
        };
        ws.on('open', onOpen);
      });
    }

    throw new Error(`WebSocket is not open: readyState ${ws.readyState}`);
  }

  /**
   * Send raw BiDi command and get response
   */
  async sendBiDiCommand(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.driver) {
      throw new Error('Driver not connected');
    }

    const bidi = await this.driver.getBidi();
    const ws = bidi.socket;

    // Wait for WebSocket to be ready before sending
    await this.waitForWebSocketOpen(ws);

    const id = Math.floor(Math.random() * 1000000);

    return new Promise((resolve, reject) => {
      const messageHandler = (data: any) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.id === id) {
            ws.off('message', messageHandler);
            if (payload.error) {
              reject(new Error(`BiDi error: ${JSON.stringify(payload.error)}`));
            } else {
              resolve(payload.result);
            }
          }
        } catch (err) {
          // ignore parse errors
        }
      };

      ws.on('message', messageHandler);

      const command = {
        id,
        method,
        params,
      };

      ws.send(JSON.stringify(command));

      setTimeout(() => {
        ws.off('message', messageHandler);
        reject(new Error(`BiDi command timeout: ${method}`));
      }, 10000);
    });
  }

  /**
   * Close driver and cleanup.
   * When connected to an existing Firefox instance, only kills geckodriver
   * without closing the browser.
   */
  async close(): Promise<void> {
    if (this.driver) {
      if (this.options.connectExisting && 'kill' in this.driver) {
        await (this.driver as { kill(): Promise<void> }).kill();
      } else if ('quit' in this.driver) {
        await (this.driver as { quit(): Promise<void> }).quit();
      }
      this.driver = null;
    }

    // Close log file descriptor if open
    if (this.logFileFd !== undefined) {
      try {
        closeSync(this.logFileFd);
        logDebug('Log file closed');
      } catch (error) {
        logDebug(
          `Error closing log file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      this.logFileFd = undefined;
    }

    // Restore original environment variables
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.originalEnv = {};

    log('✅ Firefox DevTools closed');
  }
}
