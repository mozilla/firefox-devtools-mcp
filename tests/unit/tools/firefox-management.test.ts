/**
 * Unit tests for Firefox management tools (close_firefox_session, get_firefox_info, get_firefox_output)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions that will be used in the hoisted mock
const mockSetNextLaunchOptions = vi.hoisted(() => vi.fn());
const mockResetFirefox = vi.hoisted(() => vi.fn());
const mockGetFirefoxIfRunning = vi.hoisted(() => vi.fn());
const mockArgs = vi.hoisted(() => ({
  firefoxPath: undefined as string | undefined,
  profilePath: undefined as string | undefined,
  connectExisting: undefined as boolean | undefined,
}));

const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../../src/index.js', () => ({
  args: mockArgs,
  getFirefoxIfRunning: () => mockGetFirefoxIfRunning(),
  setNextLaunchOptions: (opts: unknown) => mockSetNextLaunchOptions(opts),
  resetFirefox: () => mockResetFirefox(),
  getFirefox: () => mockGetFirefox(),
}));

describe('Firefox Management Tools', () => {
  describe('closeFirefoxSession', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockArgs.firefoxPath = undefined;
      mockArgs.profilePath = undefined;
    });

    describe('when Firefox is NOT running', () => {
      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(null);
      });

      it('should respond when firefox session was not found', async () => {
        const { handleCloseFirefoxSession } = await import(
          '../../../src/tools/firefox-management.js'
        );

        const result = await handleCloseFirefoxSession({});

        // Make sure only the getFirefoxIfRunning variant was called
        expect(mockGetFirefoxIfRunning).toHaveBeenCalled();
        expect(mockGetFirefox).not.toHaveBeenCalled();

        expect(mockResetFirefox).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('No Firefox session is currently active.');
      });
    });

    describe('when Firefox is running', () => {
      const mockFirefoxInstance = {
        getOptions: vi.fn(),
        ensureConnected: vi.fn(),
        close: vi.fn(),
      };

      beforeEach(() => {
        mockGetFirefoxIfRunning.mockReturnValue(mockFirefoxInstance);
      });

      it('should reset firefox when connect-existing=false', async () => {
        mockFirefoxInstance.getOptions.mockReturnValue({
          connectExisting: false,
        });

        const { handleCloseFirefoxSession } = await import(
          '../../../src/tools/firefox-management.js'
        );
        const result = await handleCloseFirefoxSession({});

        // Make sure only the getFirefoxIfRunning variant was called
        expect(mockGetFirefoxIfRunning).toHaveBeenCalled();
        expect(mockGetFirefox).not.toHaveBeenCalled();

        expect(mockResetFirefox).toHaveBeenCalled();
        expect(result.content[0].text).toContain(
          'Closed the Firefox instance started by this server, a new session will start if you use browser tools again.'
        );
      });

      it('should reset firefox when connect-existing=true', async () => {
        mockFirefoxInstance.getOptions.mockReturnValue({
          connectExisting: true,
        });

        const { handleCloseFirefoxSession } = await import(
          '../../../src/tools/firefox-management.js'
        );
        const result = await handleCloseFirefoxSession({});

        // Make sure only the getFirefoxIfRunning variant was called
        expect(mockGetFirefoxIfRunning).toHaveBeenCalled();
        expect(mockGetFirefox).not.toHaveBeenCalled();

        expect(mockResetFirefox).toHaveBeenCalled();
        expect(result.content[0].text).toContain(
          'Disconnected from Firefox. The browser is still running.'
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
        getDetectedBinaryPath: vi.fn().mockReturnValue(undefined),
        getFirefoxVersion: vi.fn().mockReturnValue('123.4'),
      };

      mockGetFirefox.mockResolvedValue(mockFirefoxWithPrefs);

      const { handleGetFirefoxInfo } = await import('../../../src/tools/firefox-management.js');

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
        getDetectedBinaryPath: vi.fn().mockReturnValue(undefined),
      };

      mockGetFirefox.mockResolvedValue(mockFirefoxNoPrefs);

      const { handleGetFirefoxInfo } = await import('../../../src/tools/firefox-management.js');

      const result = await handleGetFirefoxInfo({});

      const text = result.content[0].text;
      expect(text).not.toContain('Preferences:');
    });

    it('should report an auto-detected binary path', async () => {
      const detected = 'C:\\Users\\me\\AppData\\Local\\Mozilla Firefox\\firefox.exe';
      mockGetFirefox.mockResolvedValue({
        getOptions: vi.fn().mockReturnValue({ headless: true }),
        getFirefoxVersion: vi.fn().mockReturnValue('154.0'),
        getLogFilePath: vi.fn().mockReturnValue(undefined),
        getDetectedBinaryPath: vi.fn().mockReturnValue(detected),
      });

      const { handleGetFirefoxInfo } = await import('../../../src/tools/firefox-management.js');

      const result = await handleGetFirefoxInfo({});

      expect(result.content[0].text).toContain(`Binary: ${detected} (auto-detected)`);
    });

    it('should fall back to the default label when no binary was detected', async () => {
      mockGetFirefox.mockResolvedValue({
        getOptions: vi.fn().mockReturnValue({ headless: true }),
        getFirefoxVersion: vi.fn().mockReturnValue('154.0'),
        getLogFilePath: vi.fn().mockReturnValue(undefined),
        getDetectedBinaryPath: vi.fn().mockReturnValue(undefined),
      });

      const { handleGetFirefoxInfo } = await import('../../../src/tools/firefox-management.js');

      const result = await handleGetFirefoxInfo({});

      expect(result.content[0].text).toContain('Binary: System Firefox (default)');
    });
  });
});
