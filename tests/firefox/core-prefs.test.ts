/**
 * Tests for FirefoxCore --pref handling via moz:firefoxOptions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the index module to prevent actual Firefox connection
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: mockGetFirefox,
}));

describe('FirefoxCore prefs via firefoxOptions', () => {
  const mockSetPreference = vi.fn();
  const mockGetWindowHandle = vi.fn();
  const mockServiceBuilderAddArguments = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetWindowHandle.mockResolvedValue('content-context-id');
  });

  function mockSelenium(extraOptions: Record<string, unknown> = {}) {
    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: class {
          enableBidi = vi.fn();
          addArguments = vi.fn();
          setBinary = vi.fn();
          setAcceptInsecureCerts = vi.fn();
          setPreference = mockSetPreference;
          constructor() {
            Object.assign(this, extraOptions);
          }
        },
        ServiceBuilder: class {
          setStdio = vi.fn();
          addArguments = mockServiceBuilderAddArguments;
        },
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: class {
        forBrowser = vi.fn().mockReturnThis();
        setFirefoxOptions = vi.fn().mockReturnThis();
        setFirefoxService = vi.fn().mockReturnThis();
        build = vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
          getCapabilities: vi.fn(() => ({ get: vi.fn(() => '123.4') })),
        });
      },
      Browser: { FIREFOX: 'firefox' },
    }));
  }

  it('should not call setPreference when no prefs are provided', async () => {
    mockSelenium();
    const { FirefoxCore } = await import('../../src/firefox/core.js');
    const core = new FirefoxCore({ headless: true });
    await core.connect();
    expect(mockSetPreference).not.toHaveBeenCalled();
  });

  it('should call setPreference for each pref at startup', async () => {
    mockSelenium();
    const { FirefoxCore } = await import('../../src/firefox/core.js');
    const core = new FirefoxCore({
      headless: true,
      prefs: {
        'bool.pref': true,
        'int.pref': 42,
        'string.pref': 'hello',
      },
    });
    await core.connect();
    expect(mockSetPreference).toHaveBeenCalledTimes(3);
    expect(mockSetPreference).toHaveBeenCalledWith('bool.pref', true);
    expect(mockSetPreference).toHaveBeenCalledWith('int.pref', 42);
    expect(mockSetPreference).toHaveBeenCalledWith('string.pref', 'hello');
  });

  it('should forward remote.log.level to geckodriver --log argument', async () => {
    mockSelenium();
    const { FirefoxCore } = await import('../../src/firefox/core.js');
    const core = new FirefoxCore({
      headless: true,
      prefs: { 'remote.log.level': 'Trace' },
    });
    await core.connect();
    expect(mockServiceBuilderAddArguments).toHaveBeenCalledWith('--log', 'trace');
  });

  it('should not pass --log to geckodriver when remote.log.level is not set', async () => {
    mockSelenium();
    const { FirefoxCore } = await import('../../src/firefox/core.js');
    const core = new FirefoxCore({ headless: true });
    await core.connect();
    expect(mockServiceBuilderAddArguments).not.toHaveBeenCalledWith('--log', expect.anything());
  });

  it('should not require MOZ_REMOTE_ALLOW_SYSTEM_ACCESS', async () => {
    delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
    mockSelenium();
    const { FirefoxCore } = await import('../../src/firefox/core.js');
    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });
    await expect(core.connect()).resolves.not.toThrow();
    expect(mockSetPreference).toHaveBeenCalledWith('test.pref', 'value');
  });
});
