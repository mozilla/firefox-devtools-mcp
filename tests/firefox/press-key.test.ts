/**
 * Unit tests for DomInteractions.pressKey action sequencing
 */

import { describe, it, expect, vi } from 'vitest';
import { Key } from 'selenium-webdriver';
import type { BrowsingContext, Input, Script } from 'webdriver-bidi-protocol';
import { DomInteractions } from '../../src/firefox/dom.js';
import type { BiDiFacade } from '../../src/firefox/bidi.js';

const CONTEXT = 'context-1' as BrowsingContext.BrowsingContext;

function createBidi(focusResult: unknown = true) {
  const sendCommand = vi.fn(async (method: string) => {
    if (method === 'input.performActions') {
      return {};
    }
    throw new Error(`Unexpected command: ${method}`);
  });
  const callFunction = vi.fn(async (_, functionDeclaration: string) => {
    if (functionDeclaration.includes('checkVisibility')) {
      return true;
    }
    if (functionDeclaration.includes('activeElement')) {
      return focusResult;
    }
    return undefined;
  });
  const evaluate = vi.fn(async () => undefined);
  const bidi = { sendCommand, callFunction, evaluate } as unknown as BiDiFacade;
  return { bidi, sendCommand, callFunction };
}

/**
 * Pull the key actions out of every input.performActions call, since that is
 * the only place pressKey's sequencing is observable through the bidi facade.
 */
function keyActions(sendCommand: ReturnType<typeof vi.fn>): Input.KeySourceAction[] {
  return sendCommand.mock.calls
    .filter(([method]) => method === 'input.performActions')
    .flatMap(([, params]) => params.actions as Input.SourceActions[])
    .filter((source): source is Input.KeySourceActions => source.type === 'key')
    .flatMap((source) => source.actions);
}

describe('DomInteractions.pressKey', () => {
  it('should press and release the key on the focused element', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.pressKey(CONTEXT, 'Escape');

    expect(keyActions(sendCommand)).toEqual([
      { type: 'keyDown', value: Key.ESCAPE },
      { type: 'keyUp', value: Key.ESCAPE },
    ]);
  });

  it('should hold modifiers around the key and release them in reverse order', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.pressKey(CONTEXT, 'ctrl+shift+t');

    expect(keyActions(sendCommand)).toEqual([
      { type: 'keyDown', value: Key.CONTROL },
      { type: 'keyDown', value: Key.SHIFT },
      { type: 'keyDown', value: 't' },
      { type: 'keyUp', value: 't' },
      { type: 'keyUp', value: Key.SHIFT },
      { type: 'keyUp', value: Key.CONTROL },
    ]);
  });

  it('should focus a uid before pressing the key', async () => {
    const { bidi, sendCommand, callFunction } = createBidi();
    const sharedRef: Script.SharedReference = { sharedId: 'shared-1' };
    const resolveUid = vi.fn().mockResolvedValue(sharedRef);
    const dom = new DomInteractions(bidi, resolveUid);

    await dom.pressKey(CONTEXT, 'Enter', 'uid-1');

    expect(resolveUid).toHaveBeenCalledWith(CONTEXT, 'uid-1');
    expect(callFunction).toHaveBeenCalledWith(CONTEXT, expect.stringContaining('activeElement'), [
      sharedRef,
    ]);
    expect(keyActions(sendCommand)).toEqual([
      { type: 'keyDown', value: Key.RETURN },
      { type: 'keyUp', value: Key.RETURN },
    ]);
  });

  it('should reject a uid that cannot take focus instead of pressing elsewhere', async () => {
    const { bidi, sendCommand } = createBidi(false);
    const resolveUid = vi.fn().mockResolvedValue({ sharedId: 'shared-2' });
    const dom = new DomInteractions(bidi, resolveUid);

    await expect(dom.pressKey(CONTEXT, 'Escape', 'uid-2')).rejects.toThrow(
      /uid-2 cannot receive keyboard focus/
    );
    expect(keyActions(sendCommand)).toEqual([]);
  });

  it('should reject an invalid combination before touching the bidi session', async () => {
    const { bidi, sendCommand, callFunction } = createBidi();
    const dom = new DomInteractions(bidi);

    await expect(dom.pressKey(CONTEXT, 'ctrl+k+l')).rejects.toThrow(
      /more than one non-modifier key/
    );
    expect(sendCommand).not.toHaveBeenCalled();
    expect(callFunction).not.toHaveBeenCalled();
  });
});
