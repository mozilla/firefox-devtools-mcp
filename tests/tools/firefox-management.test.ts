/**
 * Unit tests for Firefox management tools (restart_firefox, get_firefox_info, get_firefox_output)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restartFirefoxTool, getFirefoxInfoTool } from '../../src/tools/firefox-management.js';

// Create mock functions that will be used in the hoisted mock
const mockSetNextLaunchOptions = vi.hoisted(() => vi.fn());
const mockResetFirefox = vi.hoisted(() => vi.fn());
const mockGetFirefoxIfRunning = vi.hoisted(() => vi.fn());
const mockArgs = vi.hoisted(() => ({
  firefoxPath: undefined as string | undefined,
  profilePath: undefined as string | undefined,
}));

const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  args: mockArgs,
  getFirefoxIfRunning: () => mockGetFirefoxIfRunning(),
  setNextLaunchOptions: (opts: unknown) => mockSetNextLaunchOptions(opts),
  resetFirefox: () => mockResetFirefox(),
  getFirefox: () => mockGetFirefox(),
}));

describe('Firefox Management Tools', () => {
  describe('restartFirefoxTool schema', () => {
    it('should have profilePath in input schema properties', () => {
      const { properties } = restartFirefoxTool.inputSchema as {
        properties: Record<string, { type: string; description: string }>;
      };
      expect(properties.profilePath).toBeDefined();
      expect(properties.profilePath.type).toBe('string');
      expect(properties.profilePath.description).toContain('profile');
    });

    it('should have prefs in input schema properties', () => {
      const { properties } = restartFirefoxTool.inputSchema as {
        properties: Record<string, { type: string; description: string }>;
      };
      expect(properties.prefs).toBeDefined();
      expect(properties.prefs.type).toBe('object');
    });
  });

  describe('handleRestartFirefox', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockArgs.firefoxPath = undefined;
      mockArgs.profilePath = undefined;
    });

    describe('when Firefox is NOT running', () => {
      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(null);
        mockArgs.firefoxPath = '/path/to/firefox';
      });

      it('should use provided profilePath in launch options', async () => {
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({ profilePath: '/custom/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/custom/profile',
          })
        );
      });

      it('should fall back to args.profilePath when profilePath not specified', async () => {
        mockArgs.profilePath = '/cli/profile';
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/cli/profile',
          })
        );
      });

      it('should use provided profilePath over args.profilePath', async () => {
        mockArgs.profilePath = '/cli/profile';
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({ profilePath: '/override/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/override/profile',
          })
        );
      });

      it('should set profilePath to undefined when neither provided nor in CLI args', async () => {
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: undefined,
          })
        );
      });
    });

    describe('when Firefox IS running', () => {
      const mockFirefoxInstance = {
        getOptions: vi.fn(),
        isConnected: vi.fn(),
        close: vi.fn(),
      };

      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(mockFirefoxInstance);
        mockFirefoxInstance.isConnected.mockResolvedValue(true);
        mockFirefoxInstance.close.mockResolvedValue(undefined);
        mockFirefoxInstance.getOptions.mockReturnValue({
          firefoxPath: '/current/firefox',
          profilePath: '/current/profile',
          headless: false,
          env: {},
        });
      });

      it('should preserve currentOptions.profilePath when not specified', async () => {
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/current/profile',
          })
        );
      });

      it('should use provided profilePath when specified', async () => {
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({ profilePath: '/new/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/new/profile',
          })
        );
      });

      it('should include profilePath in change summary when changed', async () => {
        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        const result = await handleRestartFirefox({ profilePath: '/new/profile' });

        const text = result.content[0].text;
        expect(text).toContain('Profile');
        expect(text).toContain('/new/profile');
      });

      it('should merge prefs into launch options', async () => {
        mockFirefoxInstance.getOptions.mockReturnValue({
          firefoxPath: '/current/firefox',
          profilePath: '/current/profile',
          headless: false,
          env: {},
          prefs: { 'existing.pref': 'old' },
        });

        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({
          prefs: { 'new.pref': 'value', 'existing.pref': 'new' },
        });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            prefs: { 'existing.pref': 'new', 'new.pref': 'value' },
          })
        );
      });

      it('should preserve existing prefs when none provided', async () => {
        mockFirefoxInstance.getOptions.mockReturnValue({
          firefoxPath: '/current/firefox',
          profilePath: '/current/profile',
          headless: false,
          env: {},
          prefs: { 'existing.pref': 'value' },
        });

        const { handleRestartFirefox } = await import('../../src/tools/firefox-management.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            prefs: { 'existing.pref': 'value' },
          })
        );
      });
    });
  });

  describe('handleGetFirefoxInfo', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should include prefs in output when configured', async () => {
      const mockFirefoxWithPrefs = {
        getOptions: vi.fn().mockReturnValue({
          firefoxPath: '/path/to/firefox',
          headless: true,
          prefs: {
            'bool.pref': true,
            'int.pref': 42,
            'string.pref': 'hello',
          },
        }),
        getLogFilePath: vi.fn().mockReturnValue(undefined),
      };

      mockGetFirefox.mockResolvedValue(mockFirefoxWithPrefs);

      const { handleGetFirefoxInfo } = await import('../../src/tools/firefox-management.js');

      const result = await handleGetFirefoxInfo({});

      const text = result.content[0].text;
      expect(text).toContain('Preferences:');
      expect(text).toContain('bool.pref = true');
      expect(text).toContain('int.pref = 42');
      expect(text).toContain('string.pref = "hello"');
    });

    it('should not show preferences section when none configured', async () => {
      const mockFirefoxNoPrefs = {
        getOptions: vi.fn().mockReturnValue({
          firefoxPath: '/path/to/firefox',
          headless: true,
        }),
        getLogFilePath: vi.fn().mockReturnValue(undefined),
      };

      mockGetFirefox.mockResolvedValue(mockFirefoxNoPrefs);

      const { handleGetFirefoxInfo } = await import('../../src/tools/firefox-management.js');

      const result = await handleGetFirefoxInfo({});

      const text = result.content[0].text;
      expect(text).not.toContain('Preferences:');
    });
  });
});
