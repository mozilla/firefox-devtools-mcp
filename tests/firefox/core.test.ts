/**
 * Unit tests for FirefoxCore module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirefoxCore } from '@/firefox/core.js';
import type { FirefoxLaunchOptions } from '@/firefox/types.js';

describe('FirefoxCore', () => {
  describe('constructor', () => {
    it('should create instance with options', () => {
      const options: FirefoxLaunchOptions = {
        headless: true,
        width: 1920,
        height: 1080,
      };

      const core = new FirefoxCore(options);
      expect(core).toBeInstanceOf(FirefoxCore);
    });
  });

  describe('getCurrentContextId', () => {
    it('should return null when not connected', () => {
      const core = new FirefoxCore({ headless: true });
      expect(core.getCurrentContextId()).toBe(null);
    });
  });

  describe('setCurrentContextId', () => {
    it('should set context ID', () => {
      const core = new FirefoxCore({ headless: true });
      const contextId = 'test-context-123';

      core.setCurrentContextId(contextId);
      expect(core.getCurrentContextId()).toBe(contextId);
    });

    it('should update context ID', () => {
      const core = new FirefoxCore({ headless: true });

      core.setCurrentContextId('context-1');
      expect(core.getCurrentContextId()).toBe('context-1');

      core.setCurrentContextId('context-2');
      expect(core.getCurrentContextId()).toBe('context-2');
    });
  });

  describe('getDriver', () => {
    it('should throw error when not connected', () => {
      const core = new FirefoxCore({ headless: true });
      expect(() => core.getDriver()).toThrow('Driver not connected');
    });
  });

  describe('isConnected', () => {
    it('should return false when driver is null', async () => {
      const core = new FirefoxCore({ headless: true });
      const connected = await core.isConnected();
      expect(connected).toBe(false);
    });
  });

  describe('close', () => {
    it('should call quit() and null driver when quit() succeeds', async () => {
      const quit = vi.fn().mockResolvedValue(undefined);
      const onQuit = vi.fn().mockResolvedValue(undefined);
      const core = new FirefoxCore({ headless: true });
      (core as any).driver = { quit, onQuit_: onQuit };
      core.setCurrentContextId('ctx-1');

      await core.close();

      expect(quit).toHaveBeenCalledTimes(1);
      expect(onQuit).not.toHaveBeenCalled();
      expect(core.getCurrentContextId()).toBe(null);
      expect(() => core.getDriver()).toThrow('Driver not connected');
    });

    it('should call onQuit_() when quit() times out', async () => {
      vi.useFakeTimers();
      try {
        const onQuit = vi.fn().mockResolvedValue(undefined);
        const core = new FirefoxCore({ headless: true });
        (core as any).driver = {
          quit: vi.fn().mockReturnValue(new Promise(() => {})),
          onQuit_: onQuit,
        };
        core.setCurrentContextId('ctx-1');

        const closePromise = core.close();

        await vi.advanceTimersByTimeAsync(5500);
        await closePromise;

        expect(onQuit).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should call onQuit_() when quit() rejects', async () => {
      const onQuit = vi.fn().mockResolvedValue(undefined);
      const core = new FirefoxCore({ headless: true });
      (core as any).driver = {
        quit: vi.fn().mockRejectedValue(new Error('session not found')),
        onQuit_: onQuit,
      };
      core.setCurrentContextId('ctx-1');

      await core.close();

      expect(onQuit).toHaveBeenCalled();
    });

    it('should be idempotent with driver — second call is a no-op', async () => {
      const quit = vi.fn().mockResolvedValue(undefined);
      const onQuit = vi.fn().mockResolvedValue(undefined);
      const core = new FirefoxCore({ headless: true });
      (core as any).driver = { quit, onQuit_: onQuit };
      core.setCurrentContextId('ctx-1');

      await core.close();
      await core.close();

      expect(quit).toHaveBeenCalledTimes(1);
      expect(onQuit).not.toHaveBeenCalled();
    });

    it('should be idempotent without driver — returns without error', async () => {
      const core = new FirefoxCore({ headless: true });
      await core.close();
      await expect(core.close()).resolves.toBeUndefined();
    });

    it('should close BiDi WebSocket and clear the reference', async () => {
      const bidiClose = vi.fn();
      const webdriver = {
        quit: vi.fn().mockResolvedValue(undefined),
        _bidiConnection: { close: bidiClose },
      };
      const core = new FirefoxCore({ headless: true });
      (core as any).driver = webdriver;

      await core.close();

      expect(bidiClose).toHaveBeenCalled();
      expect(webdriver._bidiConnection).toBeUndefined();
    });

    it('should swallow BiDi close errors and continue cleanup', async () => {
      const webdriver = {
        quit: vi.fn().mockResolvedValue(undefined),
        _bidiConnection: {
          close: vi.fn().mockImplementation(() => {
            throw new Error('ws dead');
          }),
        },
      };
      const core = new FirefoxCore({ headless: true });
      (core as any).driver = webdriver;
      core.setCurrentContextId('ctx-1');

      await core.close();

      expect(webdriver._bidiConnection).toBeUndefined();
    });

    it('should restore env vars and clear state fields', async () => {
      const savedNewKey = process.env.FIREFOX_MCP_TEST_NEWKEY;
      const savedExisting = process.env.FIREFOX_MCP_TEST_EXISTING;
      try {
        const core = new FirefoxCore({ headless: true });
        (core as any).driver = {
          quit: vi.fn().mockResolvedValue(undefined),
        };
        core.setCurrentContextId('ctx-1');
        (core as any).logFilePath = '/tmp/test.log';
        (core as any).profileWarning = 'test warning';
        (core as any).logFileFd = 42;
        (core as any).originalEnv = {
          FIREFOX_MCP_TEST_NEWKEY: undefined,
          FIREFOX_MCP_TEST_EXISTING: 'oldvalue',
        };
        process.env.FIREFOX_MCP_TEST_NEWKEY = 'was-set-by-connect';
        process.env.FIREFOX_MCP_TEST_EXISTING = 'overwritten-by-connect';

        await core.close();

        expect(core.getCurrentContextId()).toBe(null);
        expect((core as any).logFilePath).toBeUndefined();
        expect((core as any).profileWarning).toBeNull();
        expect((core as any).logFileFd).toBeUndefined();
        expect((core as any).originalEnv).toEqual({});
        expect('FIREFOX_MCP_TEST_NEWKEY' in process.env).toBe(false);
        expect(process.env.FIREFOX_MCP_TEST_EXISTING).toBe('oldvalue');
      } finally {
        if (savedNewKey === undefined) {
          delete process.env.FIREFOX_MCP_TEST_NEWKEY;
        } else {
          process.env.FIREFOX_MCP_TEST_NEWKEY = savedNewKey;
        }
        if (savedExisting === undefined) {
          delete process.env.FIREFOX_MCP_TEST_EXISTING;
        } else {
          process.env.FIREFOX_MCP_TEST_EXISTING = savedExisting;
        }
      }
    });
  });
});

// Tests for connect() behavior with mocked Selenium
describe('FirefoxCore connect() profile handling', () => {
  // Mock selenium-webdriver/firefox.js at module level
  const mockAddArguments = vi.fn();
  const mockSetProfile = vi.fn();
  const mockEnableBidi = vi.fn();
  const mockSetBinary = vi.fn();
  const mockWindowSize = vi.fn();
  const mockSetAcceptInsecureCerts = vi.fn();
  const mockSetStdio = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock('selenium-webdriver/firefox.js', () => ({
      default: {
        Options: vi.fn(() => ({
          enableBidi: mockEnableBidi,
          addArguments: mockAddArguments,
          setProfile: mockSetProfile,
          setBinary: mockSetBinary,
          windowSize: mockWindowSize,
          setAcceptInsecureCerts: mockSetAcceptInsecureCerts,
        })),
        ServiceBuilder: vi.fn(() => ({
          setStdio: mockSetStdio,
        })),
      },
    }));

    vi.doMock('selenium-webdriver', () => ({
      Builder: vi.fn(() => ({
        forBrowser: vi.fn().mockReturnThis(),
        setFirefoxOptions: vi.fn().mockReturnThis(),
        setFirefoxService: vi.fn().mockReturnThis(),
        build: vi.fn().mockResolvedValue({
          getWindowHandle: vi.fn().mockResolvedValue('mock-context-id'),
          get: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      Browser: { FIREFOX: 'firefox' },
    }));

    // Mock node:fs so profile.ts doesn't touch the real filesystem
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
      openSync: vi.fn().mockReturnValue(3),
      closeSync: vi.fn(),
    }));
  });

  it('should pass the MCP-specific profile subfolder via --profile argument instead of setProfile', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const profilePath = '/path/to/test/profile';
    const core = new FirefoxCore({
      headless: true,
      profilePath,
    });

    await core.connect();

    // Assert: setProfile should NOT be called (it copies to temp dir)
    expect(mockSetProfile).not.toHaveBeenCalled();

    // The MCP uses a dedicated subfolder, not the raw profilePath
    expect(mockAddArguments).toHaveBeenCalledWith(
      '--profile',
      '/path/to/test/profile/firefox_devtools_mcp_profile'
    );
  });
});

// Tests for sendBiDiCommand WebSocket handling
describe('FirefoxCore sendBiDiCommand WebSocket readiness', () => {
  it('should wait for WebSocket to open when in CONNECTING state', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const core = new FirefoxCore({ headless: true });

    // Track event listeners and send calls
    const eventListeners: Record<string, Function[]> = {};
    const mockSend = vi.fn();

    // Mock WebSocket in CONNECTING state (readyState 0)
    const mockWs = {
      readyState: 0, // CONNECTING
      send: mockSend,
      on: vi.fn((event: string, handler: Function) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(handler);
      }),
      off: vi.fn(),
    };

    // Mock driver with BiDi socket
    (core as any).driver = {
      getBidi: vi.fn().mockResolvedValue({
        socket: mockWs,
      }),
    };

    // Start the command (don't await yet)
    const commandPromise = core.sendBiDiCommand('test.method', { foo: 'bar' });

    // Give the async code a tick to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    // ASSERT: send() should NOT have been called while still CONNECTING
    expect(mockSend).not.toHaveBeenCalled();

    // ASSERT: should have registered an 'open' event listener
    expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));

    // Now simulate WebSocket becoming OPEN
    mockWs.readyState = 1; // OPEN
    if (eventListeners['open']) {
      eventListeners['open'].forEach((handler) => handler());
    }

    // Give another tick for send to be called
    await new Promise((resolve) => setTimeout(resolve, 10));

    // ASSERT: send() should now have been called
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('"method":"test.method"'));

    // Simulate response to complete the promise
    if (eventListeners['message']) {
      const sentCommand = JSON.parse(mockSend.mock.calls[0][0]);
      eventListeners['message'].forEach((handler) =>
        handler(JSON.stringify({ id: sentCommand.id, result: { success: true } }))
      );
    }

    const result = await commandPromise;
    expect(result).toEqual({ success: true });
  });

  it('should timeout if WebSocket never opens', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const core = new FirefoxCore({ headless: true });

    // Track event listeners
    const eventListeners: Record<string, Function[]> = {};

    // Mock WebSocket stuck in CONNECTING state (never opens)
    const mockWs = {
      readyState: 0, // CONNECTING - stays this way
      send: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(handler);
      }),
      off: vi.fn(),
    };

    // Mock driver with BiDi socket
    (core as any).driver = {
      getBidi: vi.fn().mockResolvedValue({
        socket: mockWs,
      }),
    };

    // Access the private method directly to test with a short timeout
    const waitForWebSocketOpen = (core as any).waitForWebSocketOpen.bind(core);

    // ASSERT: should reject with timeout error (using 50ms timeout for fast test)
    await expect(waitForWebSocketOpen(mockWs, 50)).rejects.toThrow(/timeout.*websocket/i);
  });

  it('should throw error when WebSocket is CLOSING', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const core = new FirefoxCore({ headless: true });

    // Mock WebSocket in CLOSING state (readyState 2)
    const mockWs = {
      readyState: 2, // CLOSING
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (core as any).waitForWebSocketOpen.bind(core);

    // ASSERT: should throw immediately with descriptive error
    await expect(waitForWebSocketOpen(mockWs)).rejects.toThrow(
      /websocket is not open.*readystate 2/i
    );
  });

  it('should throw error when WebSocket is CLOSED', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const core = new FirefoxCore({ headless: true });

    // Mock WebSocket in CLOSED state (readyState 3)
    const mockWs = {
      readyState: 3, // CLOSED
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (core as any).waitForWebSocketOpen.bind(core);

    // ASSERT: should throw immediately with descriptive error
    await expect(waitForWebSocketOpen(mockWs)).rejects.toThrow(
      /websocket is not open.*readystate 3/i
    );
  });

  it('should proceed immediately when WebSocket is already OPEN', async () => {
    const { FirefoxCore } = await import('@/firefox/core.js');

    const core = new FirefoxCore({ headless: true });

    // Mock WebSocket already in OPEN state (readyState 1)
    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (core as any).waitForWebSocketOpen.bind(core);

    // ASSERT: should resolve immediately without registering any listeners
    await expect(waitForWebSocketOpen(mockWs)).resolves.toBeUndefined();
    expect(mockWs.on).not.toHaveBeenCalled();
  });
});
