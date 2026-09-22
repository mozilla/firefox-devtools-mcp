/**
 * Unit tests for DomInteractions.takeScreenshotPage
 */

import { describe, it, expect, vi } from 'vitest';
import type { BrowsingContext } from 'webdriver-bidi-protocol';
import { DomInteractions } from '../../src/firefox/dom.js';
import type { BiDiFacade } from '../../src/firefox/bidi.js';

const CONTEXT = 'context-1' as BrowsingContext.BrowsingContext;

function createBidi() {
  const sendCommand = vi.fn(async (method: string) => {
    if (method === 'browsingContext.captureScreenshot') {
      return { data: 'png-data' };
    }
    throw new Error(`Unexpected command: ${method}`);
  });
  const callFunction = vi.fn(async () => undefined);
  const evaluate = vi.fn(async () => undefined);
  const bidi = { sendCommand, callFunction, evaluate } as unknown as BiDiFacade;
  return { bidi, sendCommand };
}

describe('DomInteractions.takeScreenshotPage', () => {
  it('should capture the viewport by default', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    expect(await dom.takeScreenshotPage(CONTEXT)).toBe('png-data');
    expect(sendCommand).toHaveBeenCalledWith('browsingContext.captureScreenshot', {
      context: CONTEXT,
      format: { type: 'png' },
      origin: 'viewport',
    });
  });

  it('should capture the whole document when fullPage is set', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    expect(await dom.takeScreenshotPage(CONTEXT, true)).toBe('png-data');
    expect(sendCommand).toHaveBeenCalledWith('browsingContext.captureScreenshot', {
      context: CONTEXT,
      format: { type: 'png' },
      origin: 'document',
    });
  });
});
