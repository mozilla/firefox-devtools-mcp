import EventEmitter from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebuggingEvents } from '../../../../src/firefox/events/debugging.js';
import type { BiDiFacade } from '../../../../src/firefox/bidi.js';

function makeMockBiDi() {
  return Object.assign(new EventEmitter(), {
    subscribe: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi
      .fn()
      .mockResolvedValue({ type: 'success', result: { type: 'string', value: 'ok' } }),
  });
}

describe('DebuggingEvents', () => {
  let mockBiDi: ReturnType<typeof makeMockBiDi>;
  let events: DebuggingEvents;

  beforeEach(() => {
    mockBiDi = makeMockBiDi();
    events = new DebuggingEvents(mockBiDi as unknown as BiDiFacade);
  });

  it('subscribe called twice only attaches one listener per event', async () => {
    await events.subscribe();
    await events.subscribe();
    expect(mockBiDi.listenerCount('moz:debugging.paused')).toBe(1);
    expect(mockBiDi.listenerCount('moz:debugging.resumed')).toBe(1);
    expect(mockBiDi.subscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribe does not throw when bidi.subscribe rejects', async () => {
    mockBiDi.subscribe.mockRejectedValue(new Error('unsupported event'));
    await expect(events.subscribe()).resolves.not.toThrow();
  });

  describe('logpoints', () => {
    const LOGPOINT_ID = 'bp-1';
    const URL = 'https://example.com/script.js';
    const LINE = 10;

    beforeEach(async () => {
      await events.subscribe();
    });

    it('getLogpointResults returns null for unknown logpoint', () => {
      expect(events.getLogpointResults('unknown')).toBeNull();
    });

    it('getLogpointResults returns empty array before any hit', () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      expect(events.getLogpointResults(LOGPOINT_ID)).toEqual([]);
    });

    it('removeLogpoint clears results', () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      events.removeLogpoint(LOGPOINT_ID);
      expect(events.getLogpointResults(LOGPOINT_ID)).toBeNull();
    });

    it('pause at logpoint location evaluates expression and resumes', async () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x + 1');
      mockBiDi.emit('moz:debugging.paused', {
        context: 'ctx-1',
        url: URL,
        line: LINE,
        column: 0,
        callFrames: [],
      });

      await vi.waitFor(() =>
        expect(mockBiDi.sendCommand).toHaveBeenCalledWith(
          'script.evaluate',
          expect.objectContaining({ expression: 'x + 1' })
        )
      );
      await vi.waitFor(() =>
        expect(mockBiDi.sendCommand).toHaveBeenCalledWith('moz:debugging.resume', {
          context: 'ctx-1',
        })
      );

      const results = events.getLogpointResults(LOGPOINT_ID)!;
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeUndefined();
    });

    it('stores error result when expression evaluation throws', async () => {
      mockBiDi.sendCommand.mockResolvedValueOnce({
        type: 'exception',
        exceptionDetails: { text: 'ReferenceError: x is not defined' },
      });
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      mockBiDi.emit('moz:debugging.paused', {
        context: 'ctx-1',
        url: URL,
        line: LINE,
        column: 0,
        callFrames: [],
      });

      await vi.waitFor(() => {
        const results = events.getLogpointResults(LOGPOINT_ID)!;
        return results.length > 0;
      });

      const results = events.getLogpointResults(LOGPOINT_ID)!;
      expect(results[0].error).toBe('ReferenceError: x is not defined');
    });

    it('result buffer is capped at 100, dropping oldest results first', async () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');

      for (let i = 0; i < 105; i++) {
        mockBiDi.emit('moz:debugging.paused', {
          context: 'ctx-1',
          url: URL,
          line: LINE,
          column: 0,
          callFrames: [],
        });
      }

      await vi.waitFor(
        () => {
          expect(events.getLogpointResults(LOGPOINT_ID)).toHaveLength(100);
        },
        { timeout: 1000 }
      );
    });

    it('pause at non-logpoint location does not evaluate expression', async () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      mockBiDi.emit('moz:debugging.paused', {
        context: 'ctx-1',
        url: URL,
        line: 99,
        column: 0,
        callFrames: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(mockBiDi.sendCommand).not.toHaveBeenCalled();
    });
  });
});
