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
  const instancesDir = join(homedir(), '.firefox-devtools-mcp', 'instances');
  if (!existsSync(instancesDir)) {
    logDebug(`Failed to lookup Marionette port: ${instancesDir} doesn't exist.`);
    return;
  }
  const files = readdirSync(instancesDir);
  const portFiles = files.filter((f) => /^\d+\.port$/.test(f));
  const mostRecent = portFiles
    .map((f) => ({
      name: f,
      path: join(instancesDir, f),
      mtime: statSync(join(instancesDir, f)).mtimeMs,
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
    logDebug(`Failed to lookup Marionette port: No port file found in ${instancesDir}.`);
  }
}

function checkProcess(pid: number): boolean {
  try {
    // this will only check for the process' existance but not kill it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkPort(port: number, timeoutMs = 1000): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const socket = netConnect({ host: '127.0.0.1', port });
    const done = (reason: string | null) => {
      socket.destroy();
      resolve(reason);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(null));
    socket.once('timeout', () => done(`connection to 127.0.0.1:${port} timed out`));
    socket.once('error', (error: Error) => done(error.message));
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

/** geckodriver's "unable to find binary" error never mentions the fix. */
const BINARY_NOT_FOUND_HINT =
  'Unable to detect Firefox binary automatically, please provide the full path via ' +
  '--firefox-path';

export class FirefoxCore {
  private currentContextId: string | null = null;
  private detectedBinaryPath: string | undefined;
  private driver: WebDriver | null = null;
  private firefoxVersion: string | null = null;
  private logFileFd: number | undefined;
  private logFilePath: string | undefined;
  private originalEnv: Record<string, string | undefined> = {};
  private profileWarning: string | null = null;

  constructor(private options: FirefoxLaunchOptions) {}

  /**
   * Launch Firefox (or connect to an existing instance) and establish BiDi connection
   */
  async connect(): Promise<void> {
    const isAndroid = this.options.androidDevice !== undefined;
    const androidPackage = this.options.androidPackage ?? 'org.mozilla.firefox';

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
      let port = this.options.marionettePort ?? 2828;
      if (this.options.lookupMarionettePort) {
        logDebug('Looking up Marionette port');
        const lookedUpPort = lookupMarionettePort();
        if (lookedUpPort !== undefined) {
          port = lookedUpPort;
        } else {
          throw new Error(
            'Marionette port not found: please enable Firefox remote control for AI tooling using the AI assistant companion button.'
          );
        }
      }
      logDebug(`Using Marionette port ${port}`);

      // Fail fast with an actionable message instead of letting geckodriver
      // retry the connection for a minute and report a bare socket error.
      const failure = await checkPort(port);
      if (failure) {
        if (this.options.lookupMarionettePort) {
          throw new Error(
            `No Marionette listener on 127.0.0.1:${port} (${failure}). ` +
              'Please enable Firefox remote control for AI tooling using the AI assistant companion button.'
          );
        } else {
          throw new Error(
            `No Marionette listener on 127.0.0.1:${port} (${failure}). Start Firefox with ` +
              'both flags: firefox --marionette --remote-debugging-port, or pass the port it ' +
              'is actually using via --marionette-port.'
          );
        }
      }

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
      this.driver = firefox.Driver.createSession(caps, serviceBuilder.build());
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

      // Resolve geckodriver ourselves only where Selenium Manager cannot do the
      // job, because giving the service an executable costs more than it looks.
      // selenium-webdriver calls getBinaryPaths() only when the DriverService
      // has none, and that single call resolves geckodriver *and* the Firefox
      // binary it injects into moz:firefoxOptions.binary. Passing a path
      // therefore also opts out of finding Firefox, which is exactly what the
      // Android branch above relies on and what broke desktop users with no
      // system Firefox in 0.10.2.
      //   win32: ServiceBuilder() invoked from the MCP hangs (Bug 2040849).
      //   non-x64 Linux: Selenium Manager ships an x86-64 binary that cannot
      //   execute on aarch64 (Bug 2062055).
      // Everywhere else Selenium Manager works, so let it resolve both.
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

    // Remember current window handle (browsing context)
    this.currentContextId = await this.driver.getWindowHandle();
    logDebug(`Browsing context ID: ${this.currentContextId}`);

    // Navigate if startUrl provided (skip for connectExisting to not disrupt the user's browsing)
    if (this.options.startUrl && !this.options.connectExisting) {
      await this.driver.get(this.options.startUrl);
      logDebug(`Navigated to: ${this.options.startUrl}`);
    }

    log('Firefox DevTools ready');
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
    if (!this.driver) {
      return;
    }

    const webdriver = this.driver as any; // Selenium WebDriver
    const webdriverQuitTimeout = 5000;

    // Null to prevent re-entrancy
    this.driver = null;
    this.currentContextId = null;
    this.logFilePath = undefined;
    this.profileWarning = null;

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

    // In connect-existing mode, geckodriver's DELETE /session releases Marionette
    // without terminating Firefox (since geckodriver was started with --connect-existing).
    if ('quit' in webdriver) {
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
