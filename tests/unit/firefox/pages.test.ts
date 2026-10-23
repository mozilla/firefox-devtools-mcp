/**
 * Unit tests for PageManagement and isCommonScheme
 *
 * Navigation uses BiDi browsingContext.navigate for all URLs.
 * Common schemes (http/https/data/blob/file) use wait:"interactive".
 * Uncommon schemes (moz-extension:, about:, etc.) use wait:"none"
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { ReadinessState } from '@/firefox/bidi.js';
import {
  isCommonScheme,
  isReadinessState,
  PageManagement,
  READINESS_STATES,
} from '@/firefox/pages.js';

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

describe('isReadinessState', () => {
  it('accepts the three BiDi readiness states', () => {
    expect(READINESS_STATES).toEqual(['none', 'interactive', 'complete']);
    for (const state of READINESS_STATES) {
      expect(isReadinessState(state)).toBe(true);
    }
  });

  it('rejects anything else, including the DOM event name "load"', () => {
    expect(isReadinessState('load')).toBe(false);
    expect(isReadinessState('COMPLETE')).toBe(false);
    expect(isReadinessState(undefined)).toBe(false);
    expect(isReadinessState(true)).toBe(false);
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
      driver as any,
      getCurrentContextId,
      setCurrentContextId,
      sendBiDiCommand
    );
    return { pages, sendBiDiCommand };
  }

  describe('tab titles', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives up on a tab whose title does not come back in time', async () => {
      vi.useFakeTimers();
      const driver = {
        getAllWindowHandles: vi.fn().mockResolvedValue(['tab-1', 'tab-2']),
        getWindowHandle: vi.fn().mockResolvedValue('tab-1'),
      } as any;
      const sendBiDiCommand = vi.fn((method: string, params: any) => {
        if (method === 'browsingContext.getTree') {
          return Promise.resolve({
            contexts: [
              { context: 'tab-1', url: 'https://example.com/a' },
              { context: 'tab-2', url: 'https://example.com/b' },
            ],
          });
        }
        if (params.target.context === 'tab-2') {
          return new Promise(() => {});
        }
        return Promise.resolve({ type: 'success', result: { type: 'string', value: 'A' } });
      });
      const pages = new PageManagement(
        driver,
        vi.fn().mockReturnValue('tab-1'),
        vi.fn(),
        sendBiDiCommand as any
      );

      const refresh = pages.refreshTabs();
      await vi.advanceTimersByTimeAsync(1000);
      await refresh;

      expect(pages.getTabs()).toEqual([
        { actor: 'tab-1', title: 'A', url: 'https://example.com/a' },
        { actor: 'tab-2', title: '(unknown)', url: 'https://example.com/b' },
      ]);
    });
  });

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

    it('honours an explicit wait for common schemes', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(HTTPS_URL, ReadinessState.Complete);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'complete',
      });
    });

    it('honours an explicit wait for uncommon schemes rather than downgrading it', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(MOZ_EXT_URL, ReadinessState.Complete);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: MOZ_EXT_URL,
        wait: 'complete',
      });

      await pages.navigate('about:blank', ReadinessState.Interactive);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: 'about:blank',
        wait: 'interactive',
      });
    });

    it('allows an explicit wait to opt out of waiting on a common scheme', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(HTTPS_URL, ReadinessState.None);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'none',
      });
    });

    it('keeps the scheme-based default when no wait is given', async () => {
      const { pages, sendBiDiCommand } = createMocks();

      await pages.navigate(HTTPS_URL, undefined);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'interactive',
      });
    });
  });

  describe('createNewPage', () => {
    it('uses BiDi navigate', async () => {
      // createNewPage needs real driver methods for switchTo/getWindowHandle
      const switchToMock = vi
        .fn()
        .mockReturnValue({ newWindow: vi.fn().mockResolvedValue(undefined) });
      const driver = {
        switchTo: switchToMock,
        getWindowHandle: vi.fn().mockResolvedValue('handle-2'),
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

    it('forwards an explicit wait override to navigate', async () => {
      const switchToMock = vi
        .fn()
        .mockReturnValue({ newWindow: vi.fn().mockResolvedValue(undefined) });
      const driver = {
        switchTo: switchToMock,
        getWindowHandle: vi.fn().mockResolvedValue('handle-2'),
      } as any;

      const sendBiDiCommand = vi.fn().mockResolvedValue({});
      const pages = new PageManagement(
        driver,
        vi.fn().mockReturnValue('handle-2'),
        vi.fn(),
        sendBiDiCommand
      );

      await pages.createNewPage(HTTPS_URL, ReadinessState.Complete);
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.navigate', {
        context: 'handle-2',
        url: HTTPS_URL,
        wait: 'complete',
      });
    });
  });

  describe('tabs', () => {
    const TREE = [
      { context: 'tab-3', url: 'https://example.com/c' },
      { context: 'tab-1', url: 'https://example.com/a' },
      { context: 'tab-2', url: '' },
    ];

    function createTabMocks(
      titles: Record<string, string>,
      { tree = TREE, currentId = 'tab-2' }: { tree?: typeof TREE; currentId?: string } = {}
    ) {
      let current = currentId;
      const window = vi.fn().mockResolvedValue(undefined);
      const driver = {
        switchTo: vi.fn().mockReturnValue({ window, newWindow: vi.fn() }),
        close: vi.fn().mockResolvedValue(undefined),
        getWindowHandle: vi.fn().mockResolvedValue('tab-new'),
      } as any;
      const setCurrentContextId = vi.fn((id: string) => {
        current = id;
      });
      const sendBiDiCommand = vi.fn(async (method: string, params: any) => {
        if (method === 'browsingContext.getTree') {
          return { contexts: tree };
        }
        if (method === 'browsingContext.navigate') {
          return {};
        }
        const title = titles[params.target.context];
        if (title === undefined) {
          throw new Error('no such frame');
        }
        return { type: 'success', result: { type: 'string', value: title } };
      });
      const pages = new PageManagement(
        driver,
        () => current,
        setCurrentContextId,
        sendBiDiCommand as any
      );
      return { pages, driver, window, setCurrentContextId, sendBiDiCommand };
    }

    it('refreshTabs reads tabs from the BiDi tree without switching tabs', async () => {
      const { pages, driver, sendBiDiCommand } = createTabMocks({ 'tab-1': 'A', 'tab-2': '' });

      await pages.refreshTabs();

      expect(driver.switchTo).not.toHaveBeenCalled();
      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.getTree', { maxDepth: 0 });
      expect(pages.getTabs()).toEqual([
        { actor: 'tab-3', title: '(unknown)', url: 'https://example.com/c' },
        { actor: 'tab-1', title: 'A', url: 'https://example.com/a' },
        { actor: 'tab-2', title: 'Untitled', url: 'about:blank' },
      ]);
      expect(pages.getSelectedTabIdx()).toBe(2);
    });

    it('refreshTabs selects the first tab when the current context is not in the tree', async () => {
      const { pages } = createTabMocks({}, { currentId: 'chrome-window' });

      await pages.refreshTabs();

      expect(pages.getSelectedTabIdx()).toBe(0);
    });

    it('refreshTabs falls back to the current tab when the tree cannot be read', async () => {
      const { pages, sendBiDiCommand } = createTabMocks({});
      sendBiDiCommand.mockRejectedValueOnce(new Error('unsupported operation'));

      await pages.refreshTabs();

      expect(pages.getTabs()).toEqual([{ actor: 'tab-2', title: 'Current Tab', url: '' }]);
      expect(pages.getSelectedTabIdx()).toBe(0);
    });

    it('createNewPage returns the index of the new tab in the tree order', async () => {
      const { pages, setCurrentContextId } = createTabMocks(
        {},
        {
          tree: [
            { context: 'tab-1', url: 'https://example.com/a' },
            { context: 'tab-new', url: HTTPS_URL },
            { context: 'tab-2', url: 'https://example.com/b' },
          ],
        }
      );

      const index = await pages.createNewPage(HTTPS_URL);

      expect(setCurrentContextId).toHaveBeenCalledWith('tab-new');
      expect(index).toBe(1);
      expect(pages.getTabs()[index]?.actor).toBe('tab-new');
    });

    it('selectTab switches to the cached tab at that index', async () => {
      const { pages, window, setCurrentContextId } = createTabMocks({});
      await pages.refreshTabs();

      await pages.selectTab(1);

      expect(window).toHaveBeenCalledWith('tab-1');
      expect(setCurrentContextId).toHaveBeenCalledWith('tab-1');
      expect(pages.getSelectedTabIdx()).toBe(1);
    });

    it('closeTab closes the cached tab at that index and selects the first remaining one', async () => {
      const { pages, driver, window, setCurrentContextId } = createTabMocks({});
      await pages.refreshTabs();

      await pages.closeTab(0);

      expect(window).toHaveBeenNthCalledWith(1, 'tab-3');
      expect(driver.close).toHaveBeenCalledOnce();
      expect(window).toHaveBeenNthCalledWith(2, 'tab-1');
      expect(setCurrentContextId).toHaveBeenCalledWith('tab-1');
      expect(pages.getTabs().map((tab) => tab.actor)).toEqual(['tab-1', 'tab-2']);
    });

    it('closeTab on the current tab moves the selection to a remaining tab', async () => {
      const { pages, driver, window } = createTabMocks({});
      await pages.refreshTabs();

      await pages.closeTab(2);

      expect(window).toHaveBeenNthCalledWith(1, 'tab-2');
      expect(driver.close).toHaveBeenCalledOnce();
      expect(window).toHaveBeenNthCalledWith(2, 'tab-3');
      expect(pages.getSelectedTabIdx()).toBe(0);
      expect(pages.getTabs().map((tab) => tab.actor)).toEqual(['tab-3', 'tab-1']);
    });

    it('ignores indexes outside the cached list', async () => {
      const { pages, driver } = createTabMocks({});
      await pages.refreshTabs();

      await pages.selectTab(3);
      await pages.closeTab(-1);

      expect(driver.switchTo).not.toHaveBeenCalled();
      expect(driver.close).not.toHaveBeenCalled();
    });

    it('does nothing when the tab list was never refreshed', async () => {
      const { pages, driver } = createTabMocks({});

      await pages.selectTab(0);
      await pages.closeTab(0);

      expect(driver.switchTo).not.toHaveBeenCalled();
      expect(driver.close).not.toHaveBeenCalled();
    });
  });
});
