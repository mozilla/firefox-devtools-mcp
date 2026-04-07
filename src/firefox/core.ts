/**
 * Core WebDriver + BiDi connection management
 */

import { Builder, Browser, Capabilities } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FirefoxLaunchOptions } from './types.js';
import { log, logDebug } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Shared driver interface — the minimal surface used by all consumers
// (DomInteractions, PageManagement, SnapshotManager, UidResolver).
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
  subscribe?: (event: string, contexts?: string[]) => Promise<void>;
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
// Geckodriver binary finder — used only for --connect-existing mode
// ---------------------------------------------------------------------------

/**
 * Finds the geckodriver binary path via selenium-manager.
 * Uses --driver (not --browser) to avoid downloading Firefox, which is
 * already running in connect-existing mode.
 */
async function findGeckodriver(): Promise<string> {
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');

  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const swPkg = require.resolve('selenium-webdriver/package.json');
    const swDir = path.dirname(swPkg);
    const platform =
      process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const ext = process.platform === 'win32' ? '.exe' : '';
    const smBin = path.join(swDir, 'bin', platform, `selenium-manager${ext}`);
    const result = JSON.parse(
      execFileSync(smBin, ['--driver', 'geckodriver', '--output', 'json'], { encoding: 'utf-8' })
    );
    return result.result.driver_path as string;
  } catch {
    // Fallback: walk the selenium cache directory to find any geckodriver binary
    const os = await import('node:os');
    const fs = await import('node:fs');
    const cacheBase = path.join(os.homedir(), '.cache/selenium/geckodriver');
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binaryName = `geckodriver${ext}`;
    try {
      if (fs.existsSync(cacheBase)) {
        for (const platformDir of fs.readdirSync(cacheBase)) {
          const platformPath = path.join(cacheBase, platformDir);
          if (!fs.statSync(platformPath).isDirectory()) {
            continue;
          }
          for (const versionDir of fs.readdirSync(platformPath).sort().reverse()) {
            const candidate = path.join(platformPath, versionDir, binaryName);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      }
    } catch {
      // ignore permission errors
    }
    throw new Error('Cannot find geckodriver binary. Ensure selenium-webdriver is installed.');
  }
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
      const port = this.options.marionettePort ?? 2828;

      // Find geckodriver binary (--driver avoids downloading Firefox via selenium-manager)
      const geckodriverPath = await findGeckodriver();
      logDebug(`Using geckodriver: ${geckodriverPath}`);

      // Build a geckodriver service that connects to the running Firefox.
      // ServiceBuilder already knows about --connect-existing and skips --websocket-port.
      const serviceBuilder = new firefox.ServiceBuilder(geckodriverPath);
      serviceBuilder.addArguments('--connect-existing', `--marionette-port=${port}`);

      // Use minimal capabilities: only request webSocketUrl for BiDi.
      // Deliberately avoid firefox.Options() here — its constructor sets
      // moz:firefoxOptions.prefs.remote.active-protocols = 1, which geckodriver
      // may apply to the running Firefox via Marionette. Changing that preference
      // on a live Firefox can disrupt the Remote Agent and leave the Marionette
      // session in a locked state that blocks reconnection.
      const caps = new Capabilities();
      caps.set('webSocketUrl', true);

      // createSession() returns synchronously; the session is established async under the hood.
      // Passing geckodriverPath to ServiceBuilder prevents getBinaryPaths() from running,
      // which would otherwise invoke selenium-manager with --browser firefox.
      const seleniumDriver = firefox.Driver.createSession(caps, serviceBuilder.build());
      this.driver = seleniumDriver as unknown as IDriver;
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
    } catch {
      logDebug('Connection check failed: Firefox is not responsive');
      return false;
    }
  }

  /**
   * Reset driver state (used when Firefox is detected as closed)
   */
  reset(): void {
    if (this.driver) {
      const d = this.driver as any;
      if (d._bidiConnection) {
        d._bidiConnection.close();
        d._bidiConnection = undefined;
      }
      if ('quit' in this.driver) {
        void (this.driver as { quit(): Promise<void> }).quit();
      }
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
        } catch {
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
      // Selenium's quit() skips closing the BiDi WebSocket when onQuit_ is set
      // (it returns early before reaching the _bidiConnection.close() branch).
      // We must close it first: geckodriver may not release the Marionette session
      // until the BiDi connection is cleanly terminated, which would leave Firefox's
      // Marionette locked and prevent reconnection.
      const d = this.driver as any;
      if (d._bidiConnection) {
        d._bidiConnection.close();
        d._bidiConnection = undefined;
      }
      // In connect-existing mode, geckodriver's DELETE /session releases Marionette
      // without terminating Firefox (since geckodriver was started with --connect-existing).
      if ('quit' in this.driver) {
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
