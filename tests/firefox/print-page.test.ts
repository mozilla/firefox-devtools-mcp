import { describe, it, expect, vi } from 'vitest';
import type { BrowsingContext } from 'webdriver-bidi-protocol';
import { DomInteractions } from '../../src/firefox/dom.js';
import type { BiDiFacade } from '../../src/firefox/bidi.js';

const CONTEXT = 'context-1' as BrowsingContext.BrowsingContext;

function createBidi() {
  const sendCommand = vi.fn(async (method: string) => {
    if (method === 'browsingContext.print') {
      return { data: 'pdf-data' };
    }
    throw new Error(`Unexpected command: ${method}`);
  });
  const bidi = { sendCommand } as unknown as BiDiFacade;
  return { bidi, sendCommand };
}

describe('DomInteractions.printPage', () => {
  it('should print in portrait without backgrounds by default', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    expect(await dom.printPage(CONTEXT)).toBe('pdf-data');
    expect(sendCommand).toHaveBeenCalledWith('browsingContext.print', {
      context: CONTEXT,
      orientation: 'portrait',
      background: false,
    });
  });

  it('should forward landscape and background', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.printPage(CONTEXT, { landscape: true, background: true });
    expect(sendCommand).toHaveBeenCalledWith('browsingContext.print', {
      context: CONTEXT,
      orientation: 'landscape',
      background: true,
    });
  });
});
