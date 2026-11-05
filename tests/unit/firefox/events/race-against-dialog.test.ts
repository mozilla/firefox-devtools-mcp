import EventEmitter from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowsingContext } from 'webdriver-bidi-protocol';
import { DialogEvents } from '../../../../src/firefox/events/dialogs.js';
import type { BiDiFacade } from '../../../../src/firefox/bidi.js';
import { logDebug } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', () => ({ logDebug: vi.fn() }));

const EVENT = 'browsingContext.userPromptOpened';

const DIALOG = {
  context: 'ctx-1',
  handler: 'ignore',
  message: 'Hello',
  type: 'alert',
} as BrowsingContext.UserPromptOpenedParameters;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('DialogEvents.raceAgainstDialogOpened', () => {
  let bidi: EventEmitter;
  let events: DialogEvents;

  beforeEach(() => {
    vi.mocked(logDebug).mockClear();
    bidi = new EventEmitter();
    events = new DialogEvents(bidi as unknown as BiDiFacade);
  });

  function race(fnResult: Promise<string>) {
    return events.raceAgainstDialogOpened(
      () => fnResult,
      (dialog) => `dialog: ${dialog.message}`
    );
  }

  it('returns the result of fn if it resolves before a dialog opens', async () => {
    const fn = deferred<string>();
    const result = race(fn.promise);
    fn.resolve('done');

    await expect(result).resolves.toBe('done');
    expect(bidi.listenerCount(EVENT)).toBe(0);
    expect(logDebug).not.toHaveBeenCalled();
  });

  it('throws if fn throws before a dialog opens, without logging the error', async () => {
    const fn = deferred<string>();
    const result = race(fn.promise);
    fn.reject(new Error('boom'));

    await expect(result).rejects.toThrow('boom');
    expect(bidi.listenerCount(EVENT)).toBe(0);
    expect(logDebug).not.toHaveBeenCalled();
  });

  it('returns dialogOpenedResult if a dialog opens before fn resolves', async () => {
    const fn = deferred<string>();
    const result = race(fn.promise);
    bidi.emit(EVENT, DIALOG);

    await expect(result).resolves.toBe('dialog: Hello');
    expect(bidi.listenerCount(EVENT)).toBe(0);

    fn.resolve('done');
    await new Promise((resolve) => setImmediate(resolve));
    expect(logDebug).not.toHaveBeenCalled();
  });

  it('logs the error if fn throws after a dialog opened', async () => {
    const fn = deferred<string>();
    const result = race(fn.promise);
    bidi.emit(EVENT, DIALOG);

    await expect(result).resolves.toBe('dialog: Hello');
    expect(bidi.listenerCount(EVENT)).toBe(0);

    fn.reject(new Error('boom'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(logDebug).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logDebug).mock.calls[0][0]).toContain('Error: boom');
  });
});
