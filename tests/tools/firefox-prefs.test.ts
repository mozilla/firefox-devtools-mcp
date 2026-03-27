/**
 * Tests for Firefox preferences tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setFirefoxPrefsTool,
  getFirefoxPrefsTool,
  handleSetFirefoxPrefs,
  handleGetFirefoxPrefs,
} from '../../src/tools/firefox-prefs.js';

// Mock the index module
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

describe('Firefox Prefs Tool Definitions', () => {
  describe('setFirefoxPrefsTool', () => {
    it('should have correct name', () => {
      expect(setFirefoxPrefsTool.name).toBe('set_firefox_prefs');
    });

    it('should require prefs parameter', () => {
      const schema = setFirefoxPrefsTool.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toContain('prefs');
    });

    it('should have description', () => {
      expect(setFirefoxPrefsTool.description).toBeDefined();
      expect(setFirefoxPrefsTool.description.length).toBeGreaterThan(0);
    });

    it('should define prefs as object type', () => {
      const schema = setFirefoxPrefsTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.prefs?.type).toBe('object');
    });
  });

  describe('getFirefoxPrefsTool', () => {
    it('should have correct name', () => {
      expect(getFirefoxPrefsTool.name).toBe('get_firefox_prefs');
    });

    it('should require names parameter', () => {
      const schema = getFirefoxPrefsTool.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toContain('names');
    });

    it('should have description', () => {
      expect(getFirefoxPrefsTool.description).toBeDefined();
      expect(getFirefoxPrefsTool.description.length).toBeGreaterThan(0);
    });

    it('should define names as array type', () => {
      const schema = getFirefoxPrefsTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.names?.type).toBe('array');
    });
  });
});

describe('Firefox Prefs Tool Handlers', () => {
  const mockExecuteScript = vi.fn();
  const mockSetContext = vi.fn();
  const mockSwitchToWindow = vi.fn();
  const mockSendBiDiCommand = vi.fn();

  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = originalEnv;
    } else {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
    }
  });

  describe('handleSetFirefoxPrefs', () => {
    it('should return error when prefs parameter is missing', async () => {
      const result = await handleSetFirefoxPrefs({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('prefs parameter is required');
    });

    it('should return success when prefs is empty', async () => {
      const result = await handleSetFirefoxPrefs({ prefs: {} });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('No preferences to set');
    });

    it('should return helpful error when MOZ_REMOTE_ALLOW_SYSTEM_ACCESS results in no privileged contexts', async () => {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

      // Without MOZ_REMOTE_ALLOW_SYSTEM_ACCESS, no privileged contexts are available
      mockSendBiDiCommand.mockResolvedValue({ contexts: [] });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn(),
        getCurrentContextId: vi.fn(),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSetFirefoxPrefs({ prefs: { 'test.pref': 'value' } });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
    });

    it('should set preferences successfully', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSetFirefoxPrefs({
        prefs: { 'test.bool': true, 'test.int': 42, 'test.string': 'hello' },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Set 3 preference(s)');
      expect(mockExecuteScript).toHaveBeenCalledTimes(3);
      expect(mockExecuteScript).toHaveBeenCalledWith(
        'Services.prefs.setBoolPref("test.bool", true)'
      );
      expect(mockExecuteScript).toHaveBeenCalledWith('Services.prefs.setIntPref("test.int", 42)');
      expect(mockExecuteScript).toHaveBeenCalledWith(
        'Services.prefs.setStringPref("test.string", "hello")'
      );
    });

    it('should handle partial failures gracefully', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });

      mockExecuteScript
        .mockResolvedValueOnce(undefined) // first pref succeeds
        .mockRejectedValueOnce(new Error('Pref error')); // second fails

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSetFirefoxPrefs({
        prefs: { 'good.pref': 'value', 'bad.pref': 'value' },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Set 1 preference(s)');
      expect(result.content[0].text).toContain('Failed to set 1 preference(s)');
    });

    it('should return error when no privileged contexts available', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({ contexts: [] });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn(),
        getCurrentContextId: vi.fn(),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSetFirefoxPrefs({ prefs: { 'test.pref': 'value' } });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No privileged contexts');
    });

    it('should call getFirefox even when MOZ_REMOTE_ALLOW_SYSTEM_ACCESS not in process.env', async () => {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });
      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSetFirefoxPrefs({ prefs: { 'test.pref': 'value' } });

      expect(mockGetFirefox).toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    });
  });

  describe('handleGetFirefoxPrefs', () => {
    it('should return error when names parameter is missing', async () => {
      const result = await handleGetFirefoxPrefs({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('names parameter is required');
    });

    it('should return error when names is empty array', async () => {
      const result = await handleGetFirefoxPrefs({ names: [] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('names parameter is required');
    });

    it('should return helpful error when MOZ_REMOTE_ALLOW_SYSTEM_ACCESS results in no privileged contexts', async () => {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

      // Without MOZ_REMOTE_ALLOW_SYSTEM_ACCESS, no privileged contexts are available
      mockSendBiDiCommand.mockResolvedValue({ contexts: [] });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn(),
        getCurrentContextId: vi.fn(),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleGetFirefoxPrefs({ names: ['test.pref'] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
    });

    it('should get preferences successfully', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });

      mockExecuteScript.mockResolvedValue({ exists: true, value: 'test-value' });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleGetFirefoxPrefs({ names: ['test.pref'] });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Firefox Preferences');
      expect(result.content[0].text).toContain('test.pref');
      expect(result.content[0].text).toContain('"test-value"');
    });

    it('should handle non-existent preferences', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });

      mockExecuteScript.mockResolvedValue({ exists: false });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleGetFirefoxPrefs({ names: ['nonexistent.pref'] });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('(not set)');
    });

    it('should return error when no privileged contexts available', async () => {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';

      mockSendBiDiCommand.mockResolvedValue({ contexts: [] });

      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn(),
        getCurrentContextId: vi.fn(),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleGetFirefoxPrefs({ names: ['test.pref'] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No privileged contexts');
    });

    it('should call getFirefox even when MOZ_REMOTE_ALLOW_SYSTEM_ACCESS not in process.env', async () => {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;

      mockSendBiDiCommand.mockResolvedValue({
        contexts: [{ context: 'chrome-context-id' }],
      });
      mockExecuteScript.mockResolvedValue({ exists: true, value: 'test-value' });
      const mockFirefox = {
        sendBiDiCommand: mockSendBiDiCommand,
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
        }),
        getCurrentContextId: vi.fn().mockReturnValue('content-context-id'),
      };
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleGetFirefoxPrefs({ names: ['test.pref'] });

      expect(mockGetFirefox).toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    });
  });
});
