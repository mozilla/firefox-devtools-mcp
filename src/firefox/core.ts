/**
 * Core WebDriver + BiDi connection management
 */

import { Builder, Browser, Capabilities, WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import {
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
} from 'node:fs';
import { connect as netConnect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import type { FirefoxLaunchOptions } from './types.js';
import { log, logDebug } from '../utils/logger.js';
import { findFirefoxBinaryWindows } from './windows-binary.js';
import { resolveProfilePath } from './profile.js';
import { instancesDir, logsDir } from '../utils/paths.js';

// ---------------------------------------------------------------------------
// Geckodriver binary finder
// ---------------------------------------------------------------------------

function findGeckodriverInPath(binaryName: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = join(dir, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findGeckodriverInSeleniumCache(binaryName: string): string | null {
  const cacheBase = join(homedir(), '.cache/selenium/geckodriver');
  try {
    if (!existsSync(cacheBase)) {
      return null;
    }
    for (const platformDir of readdirSync(cacheBase)) {
      const platformPath = join(cacheBase, platformDir);
      if (!statSync(platformPath).isDirectory()) {
        continue;
      }
      for (const versionDir of readdirSync(platformPath).sort().reverse()) {
        const candidate = join(platformPath, versionDir, binaryName);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // ignore permission errors
  }
  return null;
}

async function findGeckodriverInNpmPackage(): Promise<string | null> {
  try {
    const { download } = await import('geckodriver');
    log('geckodriver not found in PATH or selenium cache, downloading via npm package...');
    return await download();
  } catch {
    return null;
  }
}

function lookupMarionettePort(): number | void {
  const dir = instancesDir();
  if (!existsSync(dir)) {
    logDebug(`Failed to lookup Marionette port: ${dir} doesn't exist.`);
    return;
  }
  const files = readdirSync(dir);
  const portFiles = files.filter((f) => /^\d+\.port$/.test(f));
  const mostRecent = portFiles
    .map((f) => ({
      name: f,
      path: join(dir, f),
      mtime: statSync(join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (mostRecent) {
    const pid = Number(mostRecent.name.substring(0, mostRecent.name.length - 5));
    if (!checkProcess(pid)) {
      logDebug(`Failed to lookup Marionette port: No process with PID ${pid} is running.`);
      return;
    }
    logDebug(`Reading Marionette port from ${mostRecent.path}`);
    const content = readFileSync(mostRecent.path, 'utf-8').trim();
    if (/^\d+$/.test(content)) {
      return Number(content);
    } else {
      logDebug(`Failed to lookup Marionette port: "${content}" is not a number.`);
    }
  } else {
    logDebug(`Failed to lookup Marionette port: No port file found in ${dir}.`);
  }
}

type GeckodriverService = ReturnType<firefox.ServiceBuilder['build']>;

export const EXISTING_SESSION_TIMEOUT_MS = 45_000;

function checkProcess(pid: number): boolean {
  try {
    // this will only check for the process' existance but not kill it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

type MarionetteProbe =
  | { status: 'ready' }
  | { status: 'busy' }
  | { status: 'silent' }
  | { status: 'unreachable'; reason: string };

// Firefox greets from its main thread, which can be slow while it is busy.
const MARIONETTE_GREETING_TIMEOUT_MS = 5000;

/**
 * Connects to Marionette and waits for its greeting. Marionette accepts one
 * session at a time: while a session is active, it closes new connections
 * without a greeting, and geckodriver would retry them for a minute.
 */
function probeMarionette(port: number, timeoutMs = 1000): Promise<MarionetteProbe> {
  return new Promise<MarionetteProbe>((resolve) => {
    const socket = netConnect({ host: '127.0.0.1', port });
    let connected = false;
    let settled = false;
    const done = (result: MarionetteProbe) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      connected = true;
      socket.setTimeout(MARIONETTE_GREETING_TIMEOUT_MS);
    });
    socket.once('data', () => done({ status: 'ready' }));
    socket.once('close', () =>
      done(
        connected
          ? { status: 'busy' }
          : { status: 'unreachable', reason: `connection to 127.0.0.1:${port} closed` }
      )
    );
    socket.once('timeout', () =>
      done(
        connected
          ? { status: 'silent' }
          : { status: 'unreachable', reason: `connection to 127.0.0.1:${port} timed out` }
      )
    );
    socket.once('error', (error: Error) => done({ status: 'unreachable', reason: error.message }));
  });
}

/**
 * Finds the geckodriver binary using three strategies in order:
 * 1. Search PATH directly (fast, no subprocess)
 * 2. Walk the selenium cache directory
 * 3. Download via the bundled geckodriver npm package
 * Throws if none succeeds.
 */
async function findGeckodriver(): Promise<string> {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `geckodriver${ext}`;

  const found =
    findGeckodriverInPath(binaryName) ??
    findGeckodriverInSeleniumCache(binaryName) ??
    (await findGeckodriverInNpmPackage());

  if (!found) {
    throw new Error('Cannot find geckodriver binary. Ensure geckodriver is in PATH.');
  }
  return found;
}

type GeckodriverProcess = Promise<{ kill(signal: string): void }> | null;

/** The process of a started service, which DriverService.kill() forgets. */
function geckodriverProcessOf(service: GeckodriverService): GeckodriverProcess {
  const geckodriver = (service as unknown as { command_?: GeckodriverProcess }).command_;
  if (!geckodriver) {
    // command_ is private to selenium-webdriver and may change between versions.
    log('Cannot read the geckodriver process from selenium-webdriver, it cannot be force-killed');
  }
  return geckodriver ?? null;
}

/**
 * DriverService.kill() sends SIGTERM, which geckodriver ignores while it waits
 * for Marionette to create a session. A geckodriver left running would take the
 * session once Firefox grants it, and hold Firefox without any client.
 */
async function killGeckodriver(geckodriver: GeckodriverProcess): Promise<void> {
  const command = await Promise.resolve(geckodriver).catch(() => null);
  command?.kill('SIGKILL');
}

/** geckodriver's "unable to find binary" error never mentions the fix. */
const BINARY_NOT_FOUND_HINT =
  'Unable to detect Firefox binary automatically, please provide the full path via ' +
  '--firefox-path';

export class FirefoxCore {
  private currentContextId: string | null = null;
  private detectedBinaryPath: string | undefined;
  private driver: WebDriver | null = null;
  private geckodriverProcess: GeckodriverProcess = null;
  private closed = false;
  private sessionPending = false;
  private firefoxVersion: string | null = null;
  private logFileFd: number | undefined;
  private logFilePath: string | undefined;
  private originalEnv: Record<string, string | undefined> = {};
  private profileWarning: string | null = null;
  private restrictedUserContext: string | null = null;

  constructor(private options: FirefoxLaunchOptions) {}

  /**
   * Launch Firefox (or connect to an existing instance) and establish BiDi connection
   */
  async connect(): Promise<void> {
    const isAndroid = this.options.androidDevice !== undefined;
    const androidPackage = this.options.androidPackage ?? 'org.mozilla.firefox';
    let resolvedMarionettePort: number | undefined;

    if (isAndroid && !this.options.androidWipeAppData) {
      // geckodriver runs "adb shell pm clear <package>" before every Android session
      // (AndroidHandler::prepare) and offers no way to opt out, so launching wipes the
      // data of the target app instead of only using its own temporary profile.
      // Bug 2064088 tracks adding an opt-out to geckodriver.
      throw new Error(
        `Firefox for Android mode wipes all data of ${androidPackage} ` +
          'on the device: tabs, history, bookmarks, passwords, cookies and settings are all lost, ' +
          'because geckodriver clears the app data before every session and cannot be configured to skip it. ' +
          'Pass --android-wipe-app-data (or ANDROID_WIPE_APP_DATA=true) to confirm. ' +
          'Prefer a build dedicated to automation, for instance --android-package org.mozilla.fenix for Nightly.'
      );
    }

    if (isAndroid) {
      log('Launching Firefox for Android via ADB...');
      log(`Wiping all data of ${androidPackage} on the device`);
    } else if (this.options.connectExisting) {
      log('Connecting to existing Firefox via Marionette...');
    } else {
      log('Launching Firefox via Selenium WebDriver BiDi...');
    }

    if (isAndroid) {
      // Pre-set the geckodriver path so selenium-webdriver skips getBinaryPaths(),
      // which would otherwise discover the desktop Firefox binary and inject it into
      // moz:firefoxOptions.binary — conflicting with androidPackage.
      const geckodriverPath = await findGeckodriver();
      logDebug(`Using geckodriver: ${geckodriverPath}`);

      const mozOptions: Record<string, unknown> = { androidPackage };
      const deviceSerial = this.options.androidDevice;
      if (deviceSerial && deviceSerial !== 'auto') {
        mozOptions.androidDeviceSerial = deviceSerial;
      }
      if (this.options.prefs) {
        mozOptions.prefs = this.options.prefs;
      }

      const caps = new Capabilities();
      caps.set('webSocketUrl', true);
      caps.set('moz:firefoxOptions', mozOptions);
      if (this.options.acceptInsecureCerts) {
        caps.set('acceptInsecureCerts', true);
      }

      const serviceBuilder = new firefox.ServiceBuilder(geckodriverPath);
      this.driver = firefox.Driver.createSession(caps, serviceBuilder.build());
    } else if (this.options.connectExisting) {
      let port = this.options.resolvedMarionettePort ?? this.options.marionettePort ?? 2828;
      if (this.options.lookupMarionettePort && this.options.resolvedMarionettePort === undefined) {
        logDebug('Looking up Marionette port');
        const lookedUpPort = lookupMarionettePort();
        if (lookedUpPort !== undefined) {
          port = lookedUpPort;
          resolvedMarionettePort = lookedUpPort;
        } else {
          throw new Error(
            'Marionette port not found: please enable Firefox remote control for AI tooling using the AI assistant companion button.'
          );
        }
      }
      logDebug(`Using Marionette port ${port}`);

      // Fail fast with an actionable message instead of letting geckodriver
      // retry the connection for a minute and report a bare socket error.
      const probe = await probeMarionette(port);
      if (probe.status === 'busy') {
        throw new Error(
          `Another WebDriver session is already active in Firefox on 127.0.0.1:${port}, ` +
            'and Marionette allows only one at a time. If it belongs to another ' +
            'firefox-devtools-mcp server started with --connect-existing, that server releases ' +
            'Firefox when it calls close_firefox_session or after it has been idle; try again then.'
        );
      }
      if (probe.status === 'silent') {
        throw new Error(
          `Firefox accepted a connection on 127.0.0.1:${port} but Marionette did not answer ` +
            `within ${MARIONETTE_GREETING_TIMEOUT_MS / 1000} seconds. Firefox may be busy; try ` +
            'again, and check that this is the Marionette port.'
        );
      }
      if (probe.status === 'unreachable') {
        if (this.options.lookupMarionettePort) {
          throw new Error(
            `No Marionette listener on 127.0.0.1:${port} (${probe.reason}). ` +
              'Please enable Firefox remote control for AI tooling using the AI assistant companion button.'
          );
        } else {
          throw new Error(
            `No Marionette listener on 127.0.0.1:${port} (${probe.reason}). Start Firefox with ` +
              'both flags: firefox --marionette --remote-debugging-port, or pass the port it ' +
              'is actually using via --marionette-port.'
          );
        }
      }

      const geckodriverPath = await findGeckodriver();
      logDebug(`Using geckodriver: ${geckodriverPath}`);

      // The server may have shut down while the port was probed and geckodriver
      // looked up. Starting geckodriver now would leave it running on its own.
      if (this.closed) {
        throw new Error('The connection to Firefox was closed while connecting');
      }

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
      const service = serviceBuilder.build();
      this.driver = firefox.Driver.createSession(caps, service);
      this.geckodriverProcess = geckodriverProcessOf(service);
      await this.waitForExistingSession(service);
    } else {
      // Set up output file for capturing Firefox stdout/stderr
      if (this.options.logFile) {
        this.logFilePath = this.options.logFile;
      } else if (this.options.env && Object.keys(this.options.env).length > 0) {
        const dir = logsDir();
        mkdirSync(dir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFilePath = join(dir, `firefox-${timestamp}.log`);
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

      // Bug 2055849: fully avoid Firefox update processing, unless the mcp
      // configuration already sets MOZ_DISABLE_UPDATE_PROCESSING itself.
      if (!this.options.env || !('MOZ_DISABLE_UPDATE_PROCESSING' in this.options.env)) {
        this.originalEnv.MOZ_DISABLE_UPDATE_PROCESSING = process.env.MOZ_DISABLE_UPDATE_PROCESSING;
        process.env.MOZ_DISABLE_UPDATE_PROCESSING = '1';
        logDebug('Set env MOZ_DISABLE_UPDATE_PROCESSING=1');
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
      } else if (process.platform === 'win32') {
        // geckodriver misses per-user Windows installs.
        const discoveredBinary = findFirefoxBinaryWindows();
        if (discoveredBinary) {
          logDebug(`Using auto-detected Firefox binary: ${discoveredBinary}`);
          firefoxOptions.setBinary(discoveredBinary);
          this.detectedBinaryPath = discoveredBinary;
        }
      }
      if (this.options.args && this.options.args.length > 0) {
        firefoxOptions.addArguments(...this.options.args);
      }
      if (this.options.profilePath) {
        // Resolve to a dedicated MCP subfolder to avoid exposing a real user profile.
        // resolveProfilePath creates the directory on first use and warns when the
        // provided path already looks like a real Firefox profile.
        const { path: resolvedProfilePath, warning } = resolveProfilePath(this.options.profilePath);
        this.profileWarning = warning;
        // Use Firefox's native --profile argument for reliable profile loading
        // (Selenium's setProfile() copies to temp dir which can be unreliable)
        firefoxOptions.addArguments('--profile', resolvedProfilePath);
        log(`Using Firefox profile: ${resolvedProfilePath}`);
      }
      if (this.options.acceptInsecureCerts) {
        firefoxOptions.setAcceptInsecureCerts(true);
      }
      if (this.options.prefs) {
        for (const [name, value] of Object.entries(this.options.prefs)) {
          firefoxOptions.setPreference(name, value);
        }
        if (
          this.options.prefs['remote.prefs.recommended'] === false &&
          !('app.update.disabledForTesting' in this.options.prefs)
        ) {
          firefoxOptions.setPreference('app.update.disabledForTesting', true);
        }
      }

      // Giving the service an executable skips getBinaryPaths(), which resolves
      // geckodriver *and* the Firefox binary injected into moz:firefoxOptions.binary.
      // Only do that where Selenium Manager cannot run: win32 hangs when invoked from
      // the MCP (Bug 2040849), non-x64 Linux ships an x86-64 binary (Bug 2062055).
      const mustResolveGeckodriver =
        process.platform === 'win32' || (process.platform === 'linux' && process.arch !== 'x64');

      let serviceBuilder;
      if (mustResolveGeckodriver) {
        const geckodriverPath = await findGeckodriver();
        logDebug(`Using geckodriver: ${geckodriverPath}`);
        serviceBuilder = new firefox.ServiceBuilder(geckodriverPath);
      } else {
        logDebug('Letting Selenium Manager resolve geckodriver and Firefox');
        serviceBuilder = new firefox.ServiceBuilder();
      }

      if (this.logFilePath) {
        // Create the parent directory, as the generated-path branch above does.
        // Without it a caller-supplied path whose directory is missing throws
        // ENOENT from deep inside connect().
        mkdirSync(dirname(this.logFilePath), { recursive: true });
        // Open file for appending, create if doesn't exist
        this.logFileFd = openSync(this.logFilePath, 'a');
        serviceBuilder.setStdio(['ignore', this.logFileFd, this.logFileFd]);
        log(`Capturing Firefox output to: ${this.logFilePath}`);
      }

      const remoteLogLevel = this.options.prefs?.['remote.log.level'];
      if (remoteLogLevel && typeof remoteLogLevel === 'string') {
        serviceBuilder.addArguments('--log', remoteLogLevel.toLowerCase());
      }

      try {
        this.driver = await new Builder()
          .forBrowser(Browser.FIREFOX)
          .setFirefoxOptions(firefoxOptions)
          .setFirefoxService(serviceBuilder)
          .build();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // geckodriver names the capability it wanted when it found no binary.
        if (message.includes('moz:firefoxOptions.binary')) {
          throw new Error(`${BINARY_NOT_FOUND_HINT}\n\nOriginal error: ${message}`);
        }
        throw error;
      }
    }

    log(
      this.options.connectExisting ? 'Connected to existing Firefox' : 'Firefox launched with BiDi'
    );

    // Retrieve the Firefox version from the returned capabilities.
    const driverCapabilities = await this.driver.getCapabilities();
    this.firefoxVersion = (driverCapabilities.get('browserVersion') as string) ?? null;
    logDebug(`Browser version: ${this.firefoxVersion}`);

    // In connect-existing mode, geckodriver can attach to a Firefox that was
    // started with --marionette but without --remote-debugging-port. Marionette
    // works, but the session has no BiDi endpoint, so most tools would later
    // fail with confusing errors. Detect this early with an actionable message.
    if (this.options.connectExisting && !driverCapabilities.get('webSocketUrl')) {
      throw new Error(
        'Connected to Firefox via Marionette, but the session has no WebDriver BiDi endpoint ' +
          '(missing webSocketUrl capability). Restart Firefox with both flags: ' +
          'firefox --marionette --remote-debugging-port.'
      );
    }

    // Firefox creates a dedicated user context for sessions started at runtime,
    // and reports it with this capability.
    const userContext = (driverCapabilities.get('moz:userContext') as string) ?? null;
    if (userContext && (await this.isSessionRestricted())) {
      this.restrictedUserContext = userContext;
      log(`Session restricted to user context ${userContext}`);
    }

    // Remember current window handle (browsing context)
    this.currentContextId = await this.driver.getWindowHandle();
    logDebug(`Browsing context ID: ${this.currentContextId}`);

    if (resolvedMarionettePort !== undefined) {
      this.options = {
        ...this.options,
        resolvedMarionettePort,
      };
    }

    // Navigate if startUrl provided (skip for connectExisting to not disrupt the user's browsing)
    if (this.options.startUrl && !this.options.connectExisting) {
      await this.driver.get(this.options.startUrl);
      logDebug(`Navigated to: ${this.options.startUrl}`);
    }

    log('Firefox DevTools ready');
  }

  /**
   * Wait for geckodriver to create the session on the running Firefox. When
   * remote control was enabled from the browser, Firefox asks the user to allow
   * each new session, and geckodriver waits for the answer without a timeout.
   */
  private async waitForExistingSession(service: GeckodriverService): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    this.sessionPending = true;
    try {
      await Promise.race([
        this.driver!.getSession(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Firefox did not accept the WebDriver session within ${EXISTING_SESSION_TIMEOUT_MS / 1000} seconds. ` +
                    'If Firefox is asking whether to allow remote control, allow it and try again.'
                )
              ),
            EXISTING_SESSION_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      const geckodriver = this.geckodriverProcess;
      this.driver = null;
      this.geckodriverProcess = null;
      await killGeckodriver(geckodriver);
      await service.kill().catch(() => {});
      throw error;
    } finally {
      this.sessionPending = false;
      clearTimeout(timer);
    }
  }

  /**
   * Get driver instance (throw if not connected)
   */
  getDriver(): WebDriver {
    if (!this.driver) {
      throw new Error('Driver not connected');
    }
    return this.driver;
  }

  /**
   * Ensure Firefox is still connected with a usable tab selected.
   * If the previously selected tab is gone, recovers by switching to another
   * tab or opening a new one. Returns false if the connection is unrecoverable.
   */
  async ensureConnected(): Promise<boolean> {
    if (!this.driver) {
      return false;
    }

    try {
      await this.driver.getWindowHandle();
      return true;
    } catch (e) {
      logDebug('Previously selected tab is no longer available', e);
    }

    try {
      const tabs = await this.driver.getAllWindowHandles();
      if (tabs.length) {
        logDebug('Switching to the first tab');
        for (const tab of tabs) {
          if (typeof tab === 'string') {
            await this.driver.switchTo().window(tab);
            this.currentContextId = tab;
            return true;
          }
        }
      } else {
        logDebug('All tabs have been closed, switching to a new tab');
        await this.driver.switchTo().newWindow('tab');
        this.currentContextId = await this.driver.getWindowHandle();
        return true;
      }
    } catch (e) {
      logDebug('Connection check failed: Firefox is not responsive', e);
      return false;
    }

    logDebug('Unable to select a tab to the connected Firefox instance, restarting');
    return false;
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
   * Get the current firefox version, as a string (eg "153.0a1")
   */
  getFirefoxVersion(): string | null {
    return this.firefoxVersion;
  }

  /**
   * Whether Firefox restricts the session to its user context. The user context
   * alone is not enough: the restriction also depends on a Firefox pref. A
   * restricted session rejects browser.getUserContexts.
   */
  private async isSessionRestricted(): Promise<boolean> {
    try {
      const bidi = await this.getDriver().getBidi();
      const response = (await bidi.send({ method: 'browser.getUserContexts', params: {} })) as {
        error?: string;
      };
      return response.error === 'unsupported operation';
    } catch (error) {
      logDebug('Unable to check if the session is restricted', error);
      return false;
    }
  }

  /**
   * User context the session is restricted to, or null for an unrestricted session.
   */
  getRestrictedUserContext(): string | null {
    return this.restrictedUserContext;
  }

  /**
   * Get log file path
   */
  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Get and clear the profile warning generated during connect() (if any).
   * Consumed once by the first tool response so the MCP client surfaces it to the user.
   */
  getAndClearProfileWarning(): string | null {
    const warning = this.profileWarning;
    this.profileWarning = null;
    return warning;
  }

  /**
   * Get current launch options
   */
  getOptions(): FirefoxLaunchOptions {
    return this.options;
  }

  /** Binary auto-detected at launch, when the caller supplied no --firefox-path. */
  getDetectedBinaryPath(): string | undefined {
    return this.detectedBinaryPath;
  }

  /**
   * Close driver and cleanup.
   * - Tries graceful quit() with a timeout; on timeout, force-kills via onQuit_().
   * - Restores env vars, closes log fd, clears all state.
   * - Never throws — callers can rely on cleanup completing.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (!this.driver) {
      return;
    }

    const webdriver = this.driver as any; // Selenium WebDriver
    const webdriverQuitTimeout = 5000;
    const geckodriver = this.geckodriverProcess;

    // Null to prevent re-entrancy
    this.driver = null;
    this.geckodriverProcess = null;
    this.currentContextId = null;
    this.logFilePath = undefined;
    this.profileWarning = null;
    this.restrictedUserContext = null;

    // Selenium's quit() skips closing the BiDi WebSocket when onQuit_ is set.
    // We must close it first: geckodriver may not release the Marionette session
    // until the BiDi connection is cleanly terminated.
    if (webdriver._bidiConnection) {
      try {
        webdriver._bidiConnection.close();
      } catch {
        /* already dead */
      } finally {
        webdriver._bidiConnection = undefined;
      }
    }

    // There is nothing to quit while the session is still pending, and waiting
    // for quit() to time out can outlast the client's patience at shutdown.
    if (this.sessionPending) {
      logDebug('Closing while the session is pending - killing geckodriver');
      await killGeckodriver(geckodriver);
    } else if ('quit' in webdriver) {
      // In connect-existing mode, geckodriver's DELETE /session releases Marionette
      // without terminating Firefox (since geckodriver was started with --connect-existing).
      let timer: NodeJS.Timeout;
      try {
        // Give webdriver.quit() a certain timeout
        await Promise.race([
          (webdriver as { quit(): Promise<void> }).quit(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('close timeout')), webdriverQuitTimeout);
          }),
        ]);
      } catch {
        const webdriverHasOnQuit = typeof webdriver.onQuit_ === 'function';
        logDebug('WebDriver.quit() timed out or failed - force killing geckodriver');
        if (webdriverHasOnQuit) {
          void webdriver.onQuit_().catch(() => {});
        }
      } finally {
        clearTimeout(timer!);
      }
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

    log('Firefox DevTools closed');
  }
}
