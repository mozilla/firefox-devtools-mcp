/**
 * Unit tests for DomInteractions.typeText action sequencing
 */

import { describe, it, expect, vi } from 'vitest';
import { Key } from 'selenium-webdriver';
import type { BrowsingContext, Input, Script } from 'webdriver-bidi-protocol';
import type { BiDiFacade } from '../../src/firefox/bidi.js';
import { DomInteractions, textKeyActions } from '../../src/firefox/dom.js';

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
 * the only place typeText's sequencing is observable through the bidi facade.
 */
function keyActions(sendCommand: ReturnType<typeof vi.fn>): Input.KeySourceAction[] {
  return sendCommand.mock.calls
    .filter(([method]) => method === 'input.performActions')
    .flatMap(([, params]) => params.actions as Input.SourceActions[])
    .filter((source): source is Input.KeySourceActions => source.type === 'key')
    .flatMap((source) => source.actions);
}

describe('DomInteractions.typeText', () => {
  it('should type the text on the focused element', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.typeText(CONTEXT, 'hello');

    expect(keyActions(sendCommand)).toEqual(textKeyActions('hello'));
  });

  it('should press the submit key after the text in the same sequence', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.typeText(CONTEXT, 'hello', { submitKey: 'Enter' });

    expect(keyActions(sendCommand)).toEqual([
      ...textKeyActions('hello'),
      { type: 'keyDown', value: Key.RETURN },
      { type: 'keyUp', value: Key.RETURN },
    ]);
  });

  it('should hold modifiers of the submit key around it', async () => {
    const { bidi, sendCommand } = createBidi();
    const dom = new DomInteractions(bidi);

    await dom.typeText(CONTEXT, 'hello', { submitKey: 'shift+Enter' });

    expect(keyActions(sendCommand)).toEqual([
      ...textKeyActions('hello'),
      { type: 'keyDown', value: Key.SHIFT },
      { type: 'keyDown', value: Key.RETURN },
      { type: 'keyUp', value: Key.RETURN },
      { type: 'keyUp', value: Key.SHIFT },
    ]);
  });

  it('should focus a uid first and still type through the actions keyboard', async () => {
    const { bidi, sendCommand, callFunction } = createBidi();
    const sharedRef: Script.SharedReference = { sharedId: 'shared-1' };
    const resolveUid = vi.fn().mockResolvedValue(sharedRef);
    const dom = new DomInteractions(bidi, resolveUid);

    await dom.typeText(CONTEXT, 'hello', { uid: 'uid-1' });

    expect(resolveUid).toHaveBeenCalledWith(CONTEXT, 'uid-1');
    expect(callFunction).toHaveBeenCalledWith(CONTEXT, expect.stringContaining('activeElement'), [
      sharedRef,
    ]);
    expect(keyActions(sendCommand)).toEqual(textKeyActions('hello'));
  });

  it('should reject a uid that cannot take focus before typing anything', async () => {
    const { bidi, sendCommand } = createBidi(false);
    const resolveUid = vi.fn().mockResolvedValue({ sharedId: 'shared-2' });
    const dom = new DomInteractions(bidi, resolveUid);

    await expect(dom.typeText(CONTEXT, 'hello', { uid: 'uid-2' })).rejects.toThrow(
      /uid-2 cannot receive keyboard focus/
    );
    expect(keyActions(sendCommand)).toEqual([]);
  });

  it('should reject an invalid submit key before touching the bidi session', async () => {
    const { bidi, sendCommand, callFunction } = createBidi();
    const dom = new DomInteractions(bidi);

    await expect(dom.typeText(CONTEXT, 'hello', { submitKey: 'foobar' })).rejects.toThrow(
      /unknown key "foobar"/
    );
    expect(sendCommand).not.toHaveBeenCalled();
    expect(callFunction).not.toHaveBeenCalled();
  });
});
