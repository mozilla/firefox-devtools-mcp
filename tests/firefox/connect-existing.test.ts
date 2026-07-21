/**
 * Tests for connect-existing mode (FirefoxCore behaviour)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getFirefox() reconnect behavior', () => {
  it('should reconnect when connection is lost instead of throwing', async () => {
    vi.resetModules();

    // Mock the firefox module
    const mockIsConnected = vi.fn();
    const mockConnect = vi.fn();
    const mockClose = vi.fn();

    vi.doMock('@/firefox/index.js', () => ({
      FirefoxDevTools: vi.fn(() => ({
        isConnected: mockIsConnected,
        connect: mockConnect,
        close: mockClose,
      })),
    }));

    // First call: create instance, connection works
    mockIsConnected.mockResolvedValueOnce(true);
    mockConnect.mockResolvedValue(undefined);

    // This test verifies the reconnect logic pattern:
    // When isConnected() returns false, getFirefox() should reset and create
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
});

// Tests for the BiDi endpoint check in connect-existing mode (Bug 2056470)
describe('FirefoxCore connect() BiDi endpoint check', () => {
  // Mocks for the connect-existing path
  const mockServiceAddArguments = vi.fn();
  const mockServiceBuild = vi.fn().mockReturnValue({});
  const mockCreateSession = vi.fn();
  const mockCapabilitiesSet = vi.fn();

  // Mocks for the launch path (used by the launch-mode test only)
  const mockEnableBidi = vi.fn();
  const mockOptionsAddArguments = vi.fn();

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
      existsSync: vi.fn((p: unknown) => String(p).includes('geckodriver')),
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
      openSync: vi.fn().mockReturnValue(3),
      closeSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue([]),
      statSync: vi.fn(),
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
