import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebuggingEvents } from '../../../src/firefox/events/debugging.js';

function makeMockDriver() {
  const handlers: Record<string, Function[]> = {};
  const mockWs = {
    on: vi.fn((event: string, fn: Function) => {
      (handlers[event] ??= []).push(fn);
    }),
  };
  const mockBidi = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    socket: mockWs,
  };
  return {
    driver: { getBidi: vi.fn().mockResolvedValue(mockBidi) } as any,
    mockBidi,
    mockWs,
    emit: (payload: unknown) => handlers['message']?.forEach((h) => h(JSON.stringify(payload))),
  };
}

describe('DebuggingEvents', () => {
  let mock: ReturnType<typeof makeMockDriver>;
  let sendBiDiCommand: ReturnType<typeof vi.fn>;
  let events: DebuggingEvents;

  beforeEach(() => {
    mock = makeMockDriver();
    sendBiDiCommand = vi
      .fn()
      .mockResolvedValue({ type: 'success', result: { type: 'string', value: 'ok' } });
    events = new DebuggingEvents(mock.driver, sendBiDiCommand);
  });

  it('subscribe called twice only attaches one WebSocket listener', async () => {
    await events.subscribe();
    await events.subscribe();
    expect(mock.mockWs.on).toHaveBeenCalledTimes(1);
  });

  it('subscribe does not throw when bidi.subscribe rejects', async () => {
    mock.mockBidi.subscribe.mockRejectedValue(new Error('unsupported event'));
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
      mock.emit({
        method: 'moz:debugging.paused',
        params: { context: 'ctx-1', url: URL, line: LINE, column: 0, callFrames: [] },
      });

      await vi.waitFor(() =>
        expect(sendBiDiCommand).toHaveBeenCalledWith(
          'script.evaluate',
          expect.objectContaining({ expression: 'x + 1' })
        )
      );
      await vi.waitFor(() =>
        expect(sendBiDiCommand).toHaveBeenCalledWith('moz:debugging.resume', { context: 'ctx-1' })
      );

      const results = events.getLogpointResults(LOGPOINT_ID)!;
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeUndefined();
    });

    it('stores error result when expression evaluation throws', async () => {
      sendBiDiCommand.mockResolvedValueOnce({
        type: 'exception',
        exceptionDetails: { text: 'ReferenceError: x is not defined' },
      });
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      mock.emit({
        method: 'moz:debugging.paused',
        params: { context: 'ctx-1', url: URL, line: LINE, column: 0, callFrames: [] },
      });

      await vi.waitFor(() => {
        const results = events.getLogpointResults(LOGPOINT_ID)!;
        return results.length > 0;
      });

      const results = events.getLogpointResults(LOGPOINT_ID)!;
      expect(results[0].error).toBe('ReferenceError: x is not defined');
    });

    it('pause at non-logpoint location does not evaluate expression', async () => {
      events.addLogpoint(LOGPOINT_ID, URL, LINE, 'x');
      mock.emit({
        method: 'moz:debugging.paused',
        params: { context: 'ctx-1', url: URL, line: 99, column: 0, callFrames: [] },
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(sendBiDiCommand).not.toHaveBeenCalled();
    });
  });
});
