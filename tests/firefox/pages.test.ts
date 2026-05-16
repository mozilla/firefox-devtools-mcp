/**
 * Unit tests for PageManagement and isPrivilegedUrl
 *
 * The moz-extension:// fix: geckodriver's driver.get() hangs on extension URLs
 * because it waits for BiDi navigation completion events that the Remote Agent
 * never emits for extension contexts. The fix routes moz-extension:// URLs
 * through BiDi browsingContext.navigate with wait:"none", which returns
 * immediately without waiting for load events.
 */

import { describe, it, expect, vi } from 'vitest';
import { isPrivilegedUrl, PageManagement } from '@/firefox/pages.js';

// -- isPrivilegedUrl ----------------------------------------------------------

describe('isPrivilegedUrl', () => {
  it('returns true for moz-extension:// URLs', () => {
    expect(isPrivilegedUrl('moz-extension://abc123/popup.html')).toBe(true);
  });

  it('returns false for https:// URLs', () => {
    expect(isPrivilegedUrl('https://example.com')).toBe(false);
  });

  it('returns false for http:// URLs', () => {
    expect(isPrivilegedUrl('http://localhost:3000')).toBe(false);
  });

  it('returns false for file:// URLs', () => {
    expect(isPrivilegedUrl('file:///path/to/page.html')).toBe(false);
  });

  it('returns false for about: URLs (not in PRIVILEGED_URL_SCHEMES)', () => {
    expect(isPrivilegedUrl('about:blank')).toBe(false);
  });

  // Malformed strings make URL constructor throw; the catch block returns false
  it('returns false for malformed URLs', () => {
    expect(isPrivilegedUrl('not-a-url')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPrivilegedUrl('')).toBe(false);
  });
});

// -- PageManagement -----------------------------------------------------------

describe('PageManagement', () => {
  type BiDiCommandFn = (method: string, params: Record<string, any>) => Promise<any>;

  /**
   * Build mocked PageManagement dependencies.
   *
   * The contextId handling is subtle: null and undefined mean different things.
   * - contextId: null   → explicitly null (no browsing context available)
   * - contextId omitted → defaults to 'ctx-1' (normal case)
   *
   * We use `'contextId' in overrides` to distinguish these, because
   * `null ?? 'ctx-1'` would incorrectly collapse null into the default.
   */
  function createMocks(overrides?: { contextId?: string | null; sendBiDiCommand?: BiDiCommandFn }) {
    const driver = { get: vi.fn().mockResolvedValue(undefined) } as any;
    const hasContextId = 'contextId' in (overrides ?? {});
    const contextId = hasContextId ? overrides!.contextId : 'ctx-1';
    const getCurrentContextId = vi.fn().mockImplementation(() => contextId);
    const setCurrentContextId = vi.fn();

    // When sendBiDiCommand is provided, wrap it in a mock so we can assert calls.
    // When omitted, it stays undefined — simulates BiDi being unavailable.
    const sendBiDiCommand = overrides?.sendBiDiCommand
      ? vi.fn().mockImplementation(overrides.sendBiDiCommand)
      : undefined;

    const pages = new PageManagement(driver, getCurrentContextId, setCurrentContextId, sendBiDiCommand as any);
    return { pages, driver, getCurrentContextId, setCurrentContextId, sendBiDiCommand: sendBiDiCommand as any };
  }

  describe('navigate', () => {
    // Core fix: moz-extension:// must use BiDi, not driver.get()
    it('uses BiDi browsingContext.navigate with wait:none for moz-extension:// URLs', async () => {
      const bidiFn = vi.fn().mockResolvedValue({});
      const { pages, driver, sendBiDiCommand } = createMocks({ sendBiDiCommand: bidiFn });

      await pages.navigate('moz-extension://abc123/popup.html');

      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: 'moz-extension://abc123/popup.html',
        wait: 'none',
      });
      expect(driver.get).not.toHaveBeenCalled();
    });

    // Guard: no context ID means we can't send a BiDi command.
    // Also verify sendBiDiCommand was never called (not just that it threw).
    it('throws when context ID is null for moz-extension:// URL', async () => {
      const bidiFn = vi.fn().mockResolvedValue({});
      const { pages, sendBiDiCommand } = createMocks({ contextId: null, sendBiDiCommand: bidiFn });

      await expect(pages.navigate('moz-extension://abc123/popup.html')).rejects.toThrow(
        'Cannot navigate to privileged URL moz-extension://abc123/popup.html: no browsing context ID'
      );
      expect(sendBiDiCommand).not.toHaveBeenCalled();
    });

    // Fallback: if BiDi is not available (e.g. no Remote Agent), we still try
    // driver.get(). This will hang for moz-extension://, but there's no alternative.
    it('falls through to driver.get() for moz-extension:// when BiDi is unavailable', async () => {
      const { pages, driver, sendBiDiCommand } = createMocks();

      await pages.navigate('moz-extension://abc123/popup.html');

      expect(driver.get).toHaveBeenCalledWith('moz-extension://abc123/popup.html');
      expect(sendBiDiCommand).toBeUndefined();
    });

    // Non-privileged URLs always use the standard path
    it('uses driver.get() for normal URLs', async () => {
      const bidiFn = vi.fn().mockResolvedValue({});
      const { pages, driver, sendBiDiCommand } = createMocks({ sendBiDiCommand: bidiFn });

      await pages.navigate('https://example.com');

      expect(driver.get).toHaveBeenCalledWith('https://example.com');
      expect(sendBiDiCommand).not.toHaveBeenCalled();
    });

    // If the BiDi command rejects, the error should propagate (no silent swallow)
    it('propagates BiDi navigation errors for moz-extension:// URLs', async () => {
      const bidiFn = vi.fn().mockRejectedValue(new Error('BiDi error: invalid context'));
      const { pages } = createMocks({ sendBiDiCommand: bidiFn });

      await expect(pages.navigate('moz-extension://abc123/popup.html')).rejects.toThrow(
        'BiDi error: invalid context'
      );
    });
  });

  describe('createNewPage', () => {
    // createNewPage must delegate to navigate(), not call driver.get() directly,
    // so that the moz-extension:// BiDi path is also used for new tabs
    it('uses BiDi navigate for moz-extension:// URL after creating the tab', async () => {
      const bidiFn = vi.fn().mockResolvedValue({});
      const allHandles = ['handle-1', 'handle-2'];
      const driver = {
        get: vi.fn().mockResolvedValue(undefined),
        switchTo: vi.fn().mockReturnValue({ newWindow: vi.fn().mockResolvedValue(undefined) }),
        getAllWindowHandles: vi.fn().mockResolvedValue(allHandles),
      } as any;
      const getCurrentContextId = vi.fn().mockReturnValue('handle-2');
      const setCurrentContextId = vi.fn();

      const pages = new PageManagement(driver, getCurrentContextId, setCurrentContextId, bidiFn as any);

      const idx = await pages.createNewPage('moz-extension://abc123/popup.html');

      // Verify the BiDi navigate was used (not driver.get)
      expect(bidiFn).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'handle-2',
        url: 'moz-extension://abc123/popup.html',
        wait: 'none',
      });
      // Verify context was set before navigation
      expect(setCurrentContextId).toHaveBeenCalledWith('handle-2');
      expect(driver.get).not.toHaveBeenCalled();
      expect(idx).toBe(1);
    });

    // With a normal URL, createNewPage delegates to navigate() which uses driver.get()
    it('uses driver.get() for normal URLs after creating the tab', async () => {
      const bidiFn = vi.fn().mockResolvedValue({});
      const allHandles = ['handle-1', 'handle-2'];
      const driver = {
        get: vi.fn().mockResolvedValue(undefined),
        switchTo: vi.fn().mockReturnValue({ newWindow: vi.fn().mockResolvedValue(undefined) }),
        getAllWindowHandles: vi.fn().mockResolvedValue(allHandles),
      } as any;
      const getCurrentContextId = vi.fn().mockReturnValue('handle-2');
      const setCurrentContextId = vi.fn();

      const pages = new PageManagement(driver, getCurrentContextId, setCurrentContextId, bidiFn as any);

      const idx = await pages.createNewPage('https://example.com');

      expect(driver.get).toHaveBeenCalledWith('https://example.com');
      expect(bidiFn).not.toHaveBeenCalled();
      expect(idx).toBe(1);
    });
  });
});
