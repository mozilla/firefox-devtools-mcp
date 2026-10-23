/**
 * Unit tests for the Firefox launch tool (restart_firefox)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restartFirefoxTool } from '../../../src/tools/firefox-launch.js';

// Create mock functions that will be used in the hoisted mock
const mockSetNextLaunchOptions = vi.hoisted(() => vi.fn());
const mockResetFirefox = vi.hoisted(() => vi.fn());
const mockGetFirefoxIfRunning = vi.hoisted(() => vi.fn());
const mockGetFirefox = vi.hoisted(() => vi.fn());
const mockArgs = vi.hoisted(() => ({
  firefoxPath: undefined as string | undefined,
  profilePath: undefined as string | undefined,
  connectExisting: undefined as boolean | undefined,
}));

vi.mock('../../../src/index.js', () => ({
  args: mockArgs,
  getFirefoxIfRunning: () => mockGetFirefoxIfRunning(),
  setNextLaunchOptions: (opts: unknown) => mockSetNextLaunchOptions(opts),
  resetFirefox: () => mockResetFirefox(),
  getFirefox: () => mockGetFirefox(),
}));

describe('Firefox Launch Tools', () => {
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
      // Startup prefs go through moz:firefoxOptions: no privileged access needed.
      expect(properties.prefs.description).not.toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
    });
  });

  describe('handleRestartFirefox', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockArgs.firefoxPath = undefined;
      mockArgs.profilePath = undefined;
      mockArgs.connectExisting = undefined;
    });

    describe('when Firefox is NOT running', () => {
      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(null);
        mockArgs.firefoxPath = '/path/to/firefox';
      });

      it('should use provided profilePath in launch options', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({ profilePath: '/custom/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/custom/profile',
          })
        );
      });

      it('should fall back to args.profilePath when profilePath not specified', async () => {
        mockArgs.profilePath = '/cli/profile';
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/cli/profile',
          })
        );
      });

      it('should use provided profilePath over args.profilePath', async () => {
        mockArgs.profilePath = '/cli/profile';
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({ profilePath: '/override/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/override/profile',
          })
        );
      });

      it('should set profilePath to undefined when neither provided nor in CLI args', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

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
        ensureConnected: vi.fn(),
        close: vi.fn(),
      };

      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(mockFirefoxInstance);
        mockFirefoxInstance.ensureConnected.mockResolvedValue(true);
        mockFirefoxInstance.close.mockResolvedValue(undefined);
        mockFirefoxInstance.getOptions.mockReturnValue({
          firefoxPath: '/current/firefox',
          profilePath: '/current/profile',
          headless: false,
          env: {},
        });
      });

      it('should preserve currentOptions.profilePath when not specified', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/current/profile',
          })
        );
      });

      it('should use provided profilePath when specified', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({ profilePath: '/new/profile' });

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            profilePath: '/new/profile',
          })
        );
      });

      it('should include profilePath in change summary when changed', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

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

        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

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

        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        await handleRestartFirefox({});

        expect(mockSetNextLaunchOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            prefs: { 'existing.pref': 'value' },
          })
        );
      });
    });

    describe('when connected to an existing Firefox', () => {
      const mockFirefoxInstance = {
        getOptions: vi.fn(),
        ensureConnected: vi.fn(),
        close: vi.fn(),
      };

      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(mockFirefoxInstance);
        mockFirefoxInstance.ensureConnected.mockResolvedValue(true);
        mockFirefoxInstance.close.mockResolvedValue(undefined);
        mockFirefoxInstance.getOptions.mockReturnValue({
          connectExisting: true,
          marionettePort: 2828,
        });
      });

      it('should reject the tool, even without arguments', async () => {
        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        const result = await handleRestartFirefox({});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('close_firefox_session');
        // A rejected call must leave the existing session untouched.
        expect(mockSetNextLaunchOptions).not.toHaveBeenCalled();
        expect(mockResetFirefox).not.toHaveBeenCalled();
      });

      it('should reject the tool when the session is disconnected', async () => {
        // Without this, the call falls through to the not-running branch and
        // configures a regular launch, leaving connect-existing mode.
        mockArgs.connectExisting = true;
        mockArgs.firefoxPath = '/path/to/firefox';
        mockFirefoxInstance.ensureConnected.mockResolvedValue(false);

        const { handleRestartFirefox } = await import('../../../src/tools/firefox-launch.js');

        const result = await handleRestartFirefox({ prefs: { 'some.pref': true } });

        expect(result.isError).toBe(true);
        expect(mockSetNextLaunchOptions).not.toHaveBeenCalled();
      });
    });
  });
});
