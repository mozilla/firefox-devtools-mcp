/**
 * Tests for privileged context state consistency
 *
 * Verifies that select_privileged_context updates currentContextId,
 * and that helper tools (set_firefox_prefs, list_extensions) don't
 * silently break a user's privileged context selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Privileged context state consistency', () => {
  const mockSetContext = vi.fn();
  const mockSwitchToWindow = vi.fn();
  const mockExecuteScript = vi.fn();
  const mockExecuteAsyncScript = vi.fn();

  // Track currentContextId state as the real code would
  let mockCurrentContextId: string | null;
  const mockSetCurrentContextId = vi.fn((id: string) => {
    mockCurrentContextId = id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Start with a content context (user has a normal tab open)
    mockCurrentContextId = 'original-content-context';

    vi.doMock('../../src/index.js', () => ({
      getFirefox: vi.fn().mockResolvedValue({
        getDriver: () => ({
          switchTo: () => ({
            window: mockSwitchToWindow,
          }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
          executeAsyncScript: mockExecuteAsyncScript,
        }),
        getCurrentContextId: () => mockCurrentContextId,
        setCurrentContextId: mockSetCurrentContextId,
        sendBiDiCommand: vi.fn().mockResolvedValue({
          contexts: [
            { context: 'chrome-context-id', url: 'chrome://browser/content/browser.xhtml' },
          ],
        }),
      }),
    }));
  });

  it('select_privileged_context should update currentContextId', async () => {
    const { handleSelectPrivilegedContext } = await import('../../src/tools/privileged-context.js');

    await handleSelectPrivilegedContext({ contextId: 'chrome-context-id' });

    expect(mockSwitchToWindow).toHaveBeenCalledWith('chrome-context-id');
    expect(mockSetContext).toHaveBeenCalledWith('chrome');

    // select_privileged_context should call setCurrentContextId and update
    // currentContextId to 'chrome-context-id'
    expect(mockSetCurrentContextId).toHaveBeenCalledWith('chrome-context-id');
  });

  it('set_firefox_prefs after select_privileged_context should not revert to old context', async () => {
    const { handleSelectPrivilegedContext } = await import('../../src/tools/privileged-context.js');
    const { handleSetFirefoxPrefs } = await import('../../src/tools/firefox-prefs.js');

    // User selects privileged context
    await handleSelectPrivilegedContext({ contextId: 'chrome-context-id' });

    mockExecuteScript.mockResolvedValue(undefined);
    mockSwitchToWindow.mockClear();
    mockSetContext.mockClear();

    // Call set_firefox_prefs which requires privileged context.
    await handleSetFirefoxPrefs({ prefs: { 'browser.ml.enable': true } });

    const setContextCalls = mockSetContext.mock.calls;
    const lastSetContext = setContextCalls[setContextCalls.length - 1];

    // Check that the context has not switched to content unexpectedly.
    expect(lastSetContext[0]).not.toBe('content');
  });
});
