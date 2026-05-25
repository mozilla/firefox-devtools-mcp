/**
 * Unit tests for PageManagement and isCommonScheme
 *
 * Navigation uses BiDi browsingContext.navigate for all URLs.
 * Common schemes (http/https/data/blob/file) use wait:"interactive".
 * Uncommon schemes (moz-extension:, about:, etc.) use wait:"none"
 */

import { describe, it, expect, vi } from 'vitest';
import { isCommonScheme, PageManagement } from '@/firefox/pages.js';

const HTTPS_URL = 'https://example.com/test.html';
const HTTP_URL = 'http://example.com/test.html';
const FILE_URL = 'file:///some/path/test.html';
const MOZ_EXT_URL = 'moz-extension://a1b2c3d4-e5f6-7890-abcd-ef1234567890/popup.html';
const BLOB_URL = 'blob:https://example.org/40a5fb5a-d56d-4a33-b4e2-0acf6a8e5f64';
const DATA_URL = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==';

describe('isCommonScheme', () => {
  it('returns true for common URL schemes', () => {
    expect(isCommonScheme(HTTPS_URL)).toBe(true);
    expect(isCommonScheme(HTTP_URL)).toBe(true);
    expect(isCommonScheme(FILE_URL)).toBe(true);
    expect(isCommonScheme(DATA_URL)).toBe(true);
    expect(isCommonScheme(BLOB_URL)).toBe(true);
  });

  it('returns false for moz-extension:// URLs', () => {
    expect(isCommonScheme(MOZ_EXT_URL)).toBe(false);
  });

  it('returns false for about: URLs', () => {
    expect(isCommonScheme('about:blank')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isCommonScheme('not-a-url')).toBe(false);
  });
});

// -- PageManagement -----------------------------------------------------------

describe('PageManagement', () => {
  function createMocks() {
    // Any driver method call should fail — navigate must use BiDi, not driver
    const driver = new Proxy(
      {},
      {
        get: () => {
          throw new Error('Unexpected driver call — navigation must use BiDi');
        },
      }
    );
    const getCurrentContextId = vi.fn().mockReturnValue('ctx-1');
    const setCurrentContextId = vi.fn();
    const sendBiDiCommand = vi.fn().mockResolvedValue({});

    const pages = new PageManagement(
      driver,
      getCurrentContextId,
      setCurrentContextId,
      sendBiDiCommand
    );
    return { pages, sendBiDiCommand };
  }

  describe('navigate', () => {
    it('uses BiDi with wait:interactive for common URL schemes', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(HTTPS_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'interactive',
      });

      await pages.navigate(HTTP_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: HTTP_URL,
        wait: 'interactive',
      });

      await pages.navigate(DATA_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: DATA_URL,
        wait: 'interactive',
      });

      await pages.navigate(FILE_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: FILE_URL,
        wait: 'interactive',
      });

      await pages.navigate(BLOB_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: BLOB_URL,
        wait: 'interactive',
      });
    });

    it('uses BiDi with wait:none for uncommon URL schemes', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(MOZ_EXT_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: MOZ_EXT_URL,
        wait: 'none',
      });

      await pages.navigate('about:blank');
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: 'about:blank',
        wait: 'none',
      });

      await pages.navigate('not-a-url');
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: 'not-a-url',
        wait: 'none',
      });
    });
  });

  describe('createNewPage', () => {
    it('uses BiDi navigate', async () => {
      // createNewPage needs real driver methods for switchTo/handles
      const switchToMock = vi
        .fn()
        .mockReturnValue({ newWindow: vi.fn().mockResolvedValue(undefined) });
      const getAllWindowHandlesMock = vi.fn().mockResolvedValue(['handle-1', 'handle-2']);

      const driver = {
        switchTo: switchToMock,
        getAllWindowHandles: getAllWindowHandlesMock,
      } as any;

      const getCurrentContextId = vi.fn().mockReturnValue('handle-2');
      const setCurrentContextId = vi.fn();
      const sendBiDiCommand = vi.fn().mockResolvedValue({});

      const pages = new PageManagement(
        driver,
        getCurrentContextId,
        setCurrentContextId,
        sendBiDiCommand
      );

      // wait: interactive
      await pages.createNewPage(HTTPS_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'handle-2',
        url: HTTPS_URL,
        wait: 'interactive',
      });

      // wait: none
      await pages.createNewPage(MOZ_EXT_URL);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'handle-2',
        url: MOZ_EXT_URL,
        wait: 'none',
      });
    });
  });
});
