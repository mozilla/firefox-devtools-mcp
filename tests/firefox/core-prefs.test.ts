/**
 * Tests for FirefoxCore applyPreferences method
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the index module to prevent actual Firefox connection
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: mockGetFirefox,
}));

describe('FirefoxCore applyPreferences', () => {
  const mockExecuteScript = vi.fn();
  const mockSetContext = vi.fn();
  const mockSwitchToWindow = vi.fn();
  const mockSendBiDiCommand = vi.fn();
  const mockGetDriver = vi.fn();
  const mockGetWindowHandle = vi.fn();

  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Store original env
    originalEnv = process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

    // Setup mock driver
    mockGetDriver.mockReturnValue({
      switchTo: () => ({
        window: mockSwitchToWindow,
      }),
      setContext: mockSetContext,
      executeScript: mockExecuteScript,
      getWindowHandle: mockGetWindowHandle,
    });

    mockGetWindowHandle.mockResolvedValue('content-context-id');
  });

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = originalEnv;
    } else {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
    }
  });

  // Step 6.1
  it('should return early if no prefs', async () => {
    // Mock selenium-webdriver
    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    // Create core with no prefs
    const core = new FirefoxCore({ headless: true });

    // Mock the driver as already connected
    (core as any).driver = mockGetDriver();

    // Call applyPreferences - should not throw, should not call BiDi
    await core.applyPreferences();

    // Should not have called sendBiDiCommand since no prefs
    expect(mockSendBiDiCommand).not.toHaveBeenCalled();
  });

  // Step 6.2
  it('should throw if MOZ_REMOTE_ALLOW_SYSTEM_ACCESS not set', async () => {
    delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });

    // Mock the driver as connected
    (core as any).driver = mockGetDriver();

    await expect(core.applyPreferences()).rejects.toThrow('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
  });

  // Step 6.3 & 6.4
  it('should get chrome contexts via BiDi', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    // Setup sendBiDiCommand mock
    mockSendBiDiCommand.mockResolvedValue({
      contexts: [{ context: 'chrome-context-id' }],
    });

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
          getBidi: vi.fn().mockResolvedValue({
            socket: {
              on: vi.fn(),
              off: vi.fn(),
              send: vi.fn(),
            },
          }),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });

    // Mock internals
    (core as any).driver = mockGetDriver();
    (core as any).sendBiDiCommand = mockSendBiDiCommand;
    (core as any).currentContextId = 'content-context-id';

    await core.applyPreferences();

    expect(mockSendBiDiCommand).toHaveBeenCalledWith('browsingContext.getTree', {
      'moz:scope': 'chrome',
    });
  });

  it('should throw if no chrome contexts available', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    mockSendBiDiCommand.mockResolvedValue({ contexts: [] });

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });

    (core as any).driver = mockGetDriver();
    (core as any).sendBiDiCommand = mockSendBiDiCommand;

    await expect(core.applyPreferences()).rejects.toThrow('No chrome contexts');
  });

  // Step 6.5 & 6.6
  it('should switch to chrome context and execute pref scripts', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    mockSendBiDiCommand.mockResolvedValue({
      contexts: [{ context: 'chrome-context-id' }],
    });

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: {
        'bool.pref': true,
        'int.pref': 42,
        'string.pref': 'hello',
      },
    });

    (core as any).driver = mockGetDriver();
    (core as any).sendBiDiCommand = mockSendBiDiCommand;
    (core as any).currentContextId = 'content-context-id';

    await core.applyPreferences();

    // Should have switched to chrome context
    expect(mockSwitchToWindow).toHaveBeenCalledWith('chrome-context-id');
    expect(mockSetContext).toHaveBeenCalledWith('chrome');

    // Should have executed scripts for each pref
    expect(mockExecuteScript).toHaveBeenCalledTimes(3);
    expect(mockExecuteScript).toHaveBeenCalledWith(
      'Services.prefs.setBoolPref("bool.pref", true)'
    );
    expect(mockExecuteScript).toHaveBeenCalledWith(
      'Services.prefs.setIntPref("int.pref", 42)'
    );
    expect(mockExecuteScript).toHaveBeenCalledWith(
      'Services.prefs.setStringPref("string.pref", "hello")'
    );
  });

  // Step 6.7
  it('should restore content context in finally block', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    mockSendBiDiCommand.mockResolvedValue({
      contexts: [{ context: 'chrome-context-id' }],
    });

    // Make executeScript throw to test finally block
    mockExecuteScript.mockRejectedValue(new Error('Script error'));

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });

    (core as any).driver = mockGetDriver();
    (core as any).sendBiDiCommand = mockSendBiDiCommand;
    (core as any).currentContextId = 'content-context-id';

    // Should complete even with errors (continues on per-pref errors)
    await core.applyPreferences();

    // Should have restored content context even after error
    expect(mockSetContext).toHaveBeenLastCalledWith('content');
    expect(mockSwitchToWindow).toHaveBeenLastCalledWith('content-context-id');
  });

  // Step 10.1 - connect() integration
  it('should call applyPreferences when prefs configured in connect()', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    mockSendBiDiCommand.mockResolvedValue({
      contexts: [{ context: 'chrome-context-id' }],
    });

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
          switchTo: () => ({
            window: mockSwitchToWindow,
          }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
          getBidi: vi.fn().mockResolvedValue({
            socket: {
              on: vi.fn(),
              off: vi.fn(),
              send: vi.fn(),
            },
          }),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: { 'test.pref': 'value' },
    });

    // Spy on applyPreferences
    const applyPrefsSpy = vi.spyOn(core, 'applyPreferences').mockResolvedValue();

    await core.connect();

    // applyPreferences should have been called during connect
    expect(applyPrefsSpy).toHaveBeenCalled();
  });

  // Step 6.8
  it('should continue on per-pref errors and log failures', async () => {
    process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

    mockSendBiDiCommand.mockResolvedValue({
      contexts: [{ context: 'chrome-context-id' }],
    });

    // First pref fails, second succeeds
    mockExecuteScript
      .mockRejectedValueOnce(new Error('First pref error'))
      .mockResolvedValueOnce(undefined);

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: vi.fn(),
          addArguments: vi.fn(),
          setBinary: vi.fn(),
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: vi.fn(),
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: mockGetWindowHandle,
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    const { FirefoxCore } = await import('../../src/firefox/core.js');

    const core = new FirefoxCore({
      headless: true,
      prefs: {
        'failing.pref': 'will fail',
        'success.pref': 'will succeed',
      },
    });

    (core as any).driver = mockGetDriver();
    (core as any).sendBiDiCommand = mockSendBiDiCommand;
    (core as any).currentContextId = 'content-context-id';

    // Should not throw - errors are collected
    await core.applyPreferences();

    // Both prefs should have been attempted
    expect(mockExecuteScript).toHaveBeenCalledTimes(2);
  });
});
