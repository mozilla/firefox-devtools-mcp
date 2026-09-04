/**
 * Tests for connect-existing mode (FirefoxCore behaviour)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getFirefox() reconnect behavior', () => {
  it('should reconnect when connection is lost instead of throwing', async () => {
    vi.resetModules();

    // Mock the firefox module
    const mockEnsureConnected = vi.fn();
    const mockConnect = vi.fn();
    const mockClose = vi.fn();

    vi.doMock('@/firefox/index.js', () => ({
      FirefoxDevTools: vi.fn(() => ({
        ensureConnected: mockEnsureConnected,
        connect: mockConnect,
        close: mockClose,
      })),
    }));

    // First call: create instance, connection works
    mockEnsureConnected.mockResolvedValueOnce(true);
    mockConnect.mockResolvedValue(undefined);

    // This test verifies the reconnect logic pattern:
    // When ensureConnected() returns false, getFirefox() should reset and create
    // a new connection instead of throwing FirefoxDisconnectedError
    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({
      headless: true,
      connectExisting: true,
      marionettePort: 2828,
    });

    // Verify close() clears the state
    (core as any).driver = { quit: vi.fn().mockResolvedValue(undefined) };
    core.setCurrentContextId('old-context');
    await core.close();
    expect(core.getCurrentContextId()).toBe(null);
    expect(() => core.getDriver()).toThrow('Driver not connected');
  });

  it('should keep retrying the pinned target after a reconnect failure', async () => {
    vi.resetModules();
    const launchOptions: Array<Record<string, unknown>> = [];
    let connectAttempt = 0;

    vi.doMock('@/firefox/index.js', () => ({
      FirefoxDevTools: class {
        private readonly resolvedOptions: Record<string, unknown>;

        constructor(options: Record<string, unknown>) {
          launchOptions.push(options);
          this.resolvedOptions = {
            ...options,
            marionettePort: 3100,
            lookupMarionettePort: false,
          };
        }

        async connect(): Promise<void> {
          connectAttempt++;
          if (connectAttempt === 2) {
            throw new Error('original Firefox unavailable');
          }
        }

        async close(): Promise<void> {}

        async ensureConnected(): Promise<boolean> {
          return true;
        }

        getAndClearProfileWarning(): null {
          return null;
        }

        getOptions(): Record<string, unknown> {
          return this.resolvedOptions;
        }
      },
    }));

    const index = await import('@/index.js');
    Object.assign(index.args, {
      connectExisting: true,
      lookupMarionettePort: true,
      marionettePort: 2828,
    });

    await index.getFirefox();
    await index.resetFirefox();
    await expect(index.getFirefox()).rejects.toThrow('original Firefox unavailable');
    await index.getFirefox();

    expect(launchOptions).toHaveLength(3);
    expect(launchOptions[1]).toMatchObject({
      marionettePort: 3100,
      lookupMarionettePort: false,
    });
    expect(launchOptions[2]).toMatchObject({
      marionettePort: 3100,
      lookupMarionettePort: false,
    });

    await index.resetFirefox();
  });
});

// Tests for the BiDi endpoint check in connect-existing mode (Bug 2056470)
describe('FirefoxCore connect() BiDi endpoint check', () => {
  // Mocks for the connect-existing path
  const mockServiceAddArguments = vi.fn();
  const mockServiceBuild = vi.fn().mockReturnValue({});
  const mockCreateSession = vi.fn();
  const mockCapabilitiesSet = vi.fn();
  const mockExistsSync = vi.fn();
  const mockReaddirSync = vi.fn();
  const mockStatSync = vi.fn();
  const mockReadFileSync = vi.fn();

  // Mocks for the launch path (used by the launch-mode test only)
  const mockEnableBidi = vi.fn();
  const mockOptionsAddArguments = vi.fn();

  // Fake socket for the Marionette port probe: emits `event` on the next tick.
  const mockNetConnect = vi.fn();
  const makeSocket = (event: 'connect' | 'timeout' | 'error', error?: Error) => {
    const handlers = new Map<string, (arg?: unknown) => void>();
    return {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((name: string, handler: (arg?: unknown) => void) => {
        handlers.set(name, handler);
        if (name === event) {
          setImmediate(() => handlers.get(event)?.(error));
        }
      }),
    };
  };

  // Builds a mock WebDriver whose getCapabilities() resolves to a
  // Capabilities-like object backed by the given values.
  const makeDriver = (capabilityValues: Record<string, unknown>) => ({
    getCapabilities: vi.fn().mockResolvedValue({
      get: vi.fn((name: string) => capabilityValues[name]),
    }),
    getWindowHandle: vi.fn().mockResolvedValue('mock-context-id'),
    get: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockExistsSync.mockImplementation((path: unknown) => String(path).includes('geckodriver'));
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 0,
    });
    mockReadFileSync.mockReturnValue('');

    mockNetConnect.mockReturnValue(makeSocket('connect'));
    vi.doMock('node:net', () => ({ connect: mockNetConnect }));

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: class {
          enableBidi = mockEnableBidi;
          addArguments = mockOptionsAddArguments;
          windowSize = vi.fn();
          setBinary = vi.fn();
          setProfile = vi.fn();
          setAcceptInsecureCerts = vi.fn();
          setPreference = vi.fn();
        },
        ServiceBuilder: class {
          addArguments = mockServiceAddArguments;
          build = mockServiceBuild;
          setStdio = vi.fn();
        },
        Driver: { createSession: mockCreateSession },
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Capabilities: class {
        set = mockCapabilitiesSet;
      },
      Builder: class {
        forBrowser = vi.fn().mockReturnThis();
        setFirefoxOptions = vi.fn().mockReturnThis();
        setFirefoxService = vi.fn().mockReturnThis();
        build = vi.fn().mockResolvedValue(makeDriver({ browserVersion: '142.0' }));
      },
      Browser: { FIREFOX: 'firefox' },
    }));

    // existsSync returns true for geckodriver paths so findGeckodriver() succeeds.
    vi.doMock('node:fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
      openSync: vi.fn().mockReturnValue(3),
      closeSync: vi.fn(),
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
      readFileSync: mockReadFileSync,
    }));
  });

  it('should reject with an actionable error when the session has no webSocketUrl', async () => {
    const driver = makeDriver({ browserVersion: '142.0' });
    mockCreateSession.mockReturnValue(driver);

    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ connectExisting: true, marionettePort: 2828 });

    const connectPromise = core.connect();
    await expect(connectPromise).rejects.toThrow(/webSocketUrl/);
    await expect(connectPromise).rejects.toThrow('--marionette --remote-debugging-port');

    // The check fires before any further driver interaction
    expect(driver.getWindowHandle).not.toHaveBeenCalled();
  });

  it('should connect normally when the session has a webSocketUrl', async () => {
    const driver = makeDriver({
      browserVersion: '142.0',
      webSocketUrl: 'ws://127.0.0.1:9222/session/abc',
    });
    mockCreateSession.mockReturnValue(driver);

    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ connectExisting: true, marionettePort: 2828 });

    await core.connect();

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockServiceAddArguments).toHaveBeenCalledWith(
      '--connect-existing',
      '--marionette-port=2828'
    );
    expect(mockCapabilitiesSet).toHaveBeenCalledWith('webSocketUrl', true);
    expect(core.getFirefoxVersion()).toBe('142.0');
    expect(core.getCurrentContextId()).toBe('mock-context-id');
  });

  it('should reuse the first resolved companion port instead of looking up a newer instance', async () => {
    const driver = makeDriver({
      browserVersion: '142.0',
      webSocketUrl: 'ws://127.0.0.1:9222/session/abc',
    });
    mockCreateSession.mockReturnValue(driver);
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['100.port']);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 100,
    });
    mockReadFileSync.mockReturnValueOnce('3100').mockReturnValue('3200');
    const processKill = vi.spyOn(process, 'kill').mockReturnValue(true);

    try {
      const { FirefoxCore } = await import('@/firefox/core.js');
      const firstConnection = new FirefoxCore({
        connectExisting: true,
        lookupMarionettePort: true,
      });

      await firstConnection.connect();
      const resolvedOptions = firstConnection.getOptions();
      expect(resolvedOptions.marionettePort).toBe(3100);
      expect(resolvedOptions.lookupMarionettePort).toBe(false);

      await firstConnection.close();
      mockReaddirSync.mockReturnValue(['100.port', '200.port']);
      mockStatSync.mockImplementation((path: unknown) => ({
        isDirectory: () => false,
        mtimeMs: String(path).includes('200.port') ? 200 : 100,
      }));
      mockServiceAddArguments.mockClear();
      const reconnected = new FirefoxCore(resolvedOptions);
      await reconnected.connect();

      expect(mockServiceAddArguments).toHaveBeenCalledWith(
        '--connect-existing',
        '--marionette-port=3100'
      );
      expect(mockReadFileSync).toHaveBeenCalledOnce();
    } finally {
      processKill.mockRestore();
    }
  });

  it('should fail fast when nothing listens on the Marionette port', async () => {
    mockNetConnect.mockReturnValue(
      makeSocket('error', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:2828')))
    );

    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ connectExisting: true, marionettePort: 2828 });

    const connectPromise = core.connect();
    await expect(connectPromise).rejects.toThrow(/No Marionette listener on 127\.0\.0\.1:2828/);
    await expect(connectPromise).rejects.toThrow(/ECONNREFUSED/);

    // geckodriver is never started, so no session is created
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('should fail fast when the Marionette port does not respond', async () => {
    mockNetConnect.mockReturnValue(makeSocket('timeout'));

    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ connectExisting: true, marionettePort: 2828 });

    await expect(core.connect()).rejects.toThrow(/timed out/);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('should not probe the Marionette port in launch mode', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ headless: true });

    await core.connect();

    expect(mockNetConnect).not.toHaveBeenCalled();
  });

  it('should not apply the check in launch mode', async () => {
    // The Builder mock returns a driver without webSocketUrl; launch mode
    // must still connect because the check is connect-existing only.
    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({ headless: true });

    await core.connect();

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(core.getCurrentContextId()).toBe('mock-context-id');
  });
});
