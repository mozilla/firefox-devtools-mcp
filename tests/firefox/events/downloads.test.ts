import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadEvents } from '../../../src/firefox/events/downloads.js';

// BiDi timestamps are epoch millis; anchor to now so the TTL cleanup keeps them.
const NOW = Date.now();

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

describe('DownloadEvents', () => {
  let mock: ReturnType<typeof makeMockDriver>;
  let events: DownloadEvents;

  beforeEach(() => {
    mock = makeMockDriver();
    events = new DownloadEvents(mock.driver);
  });

  it('subscribe called twice only attaches one WebSocket listener', async () => {
    await events.subscribe();
    await events.subscribe();
    expect(mock.mockWs.on).toHaveBeenCalledTimes(1);
    expect(mock.mockBidi.subscribe).toHaveBeenCalledTimes(2);
  });

  it('subscribe propagates when bidi.subscribe rejects', async () => {
    mock.mockBidi.subscribe.mockRejectedValue(new Error('unsupported event'));
    await expect(events.subscribe()).rejects.toThrow('unsupported event');
  });

  describe('event tracking', () => {
    beforeEach(async () => {
      await events.subscribe();
    });

    it('records an in-progress download on downloadWillBegin', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: {
          download: 'dl-1',
          context: 'ctx-1',
          navigation: 'nav-1',
          url: 'https://example.com/file.zip',
          suggestedFilename: 'file.zip',
          timestamp: NOW,
        },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({
        id: 'dl-1',
        url: 'https://example.com/file.zip',
        suggestedFilename: 'file.zip',
        status: 'in_progress',
      });
    });

    it('correlates downloadEnd with willBegin via the download id', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: {
          download: 'dl-1',
          context: 'ctx-1',
          url: 'https://example.com/file.zip',
          suggestedFilename: 'file.zip',
          timestamp: NOW,
        },
      });
      mock.emit({
        method: 'browsingContext.downloadEnd',
        params: {
          download: 'dl-1',
          context: 'ctx-1',
          status: 'complete',
          filepath: '/tmp/file.zip',
          timestamp: NOW + 500,
        },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({
        id: 'dl-1',
        status: 'complete',
        filepath: '/tmp/file.zip',
        durationMs: 500,
      });
    });

    it('correlates via navigation id when no download id is present', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: {
          navigation: 'nav-1',
          context: 'ctx-1',
          url: 'https://example.com/file.zip',
          suggestedFilename: 'file.zip',
          timestamp: NOW,
        },
      });
      mock.emit({
        method: 'browsingContext.downloadEnd',
        params: {
          navigation: 'nav-1',
          context: 'ctx-1',
          status: 'complete',
          filepath: '/tmp/file.zip',
          timestamp: NOW + 1000,
        },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({ id: 'nav-1', status: 'complete' });
    });

    it('falls back to a synthetic key when download and navigation ids are absent', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: {
          context: 'ctx-1',
          url: 'https://example.com/file.zip',
          suggestedFilename: 'file.zip',
          timestamp: NOW,
        },
      });
      mock.emit({
        method: 'browsingContext.downloadEnd',
        params: {
          context: 'ctx-1',
          status: 'complete',
          filepath: '/tmp/file.zip',
          timestamp: NOW + 200,
        },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({
        status: 'complete',
        filepath: '/tmp/file.zip',
      });
    });

    it('records a downloadEnd that arrives without a preceding willBegin', () => {
      mock.emit({
        method: 'browsingContext.downloadEnd',
        params: {
          download: 'dl-orphan',
          context: 'ctx-1',
          status: 'complete',
          filepath: '/tmp/orphan.zip',
          timestamp: NOW,
        },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({
        id: 'dl-orphan',
        status: 'complete',
        filepath: '/tmp/orphan.zip',
        url: '',
      });
    });

    it('does not set filepath on a canceled download', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: {
          download: 'dl-1',
          context: 'ctx-1',
          url: 'https://example.com/f',
          timestamp: NOW,
        },
      });
      mock.emit({
        method: 'browsingContext.downloadEnd',
        params: { download: 'dl-1', context: 'ctx-1', status: 'canceled', timestamp: NOW + 10 },
      });

      expect(events.getDownloads()[0].filepath).toBeUndefined();
    });

    it('ignores unrelated messages and malformed payloads', () => {
      mock.emit({ method: 'browsingContext.load', params: { context: 'ctx-1' } });
      handlersEmitRaw(mock, 'not json');
      expect(events.getDownloads()).toHaveLength(0);
    });

    it('clearDownloads empties the buffer', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: { download: 'dl-1', context: 'ctx-1', url: 'u', timestamp: NOW },
      });
      expect(events.getDownloads()).toHaveLength(1);
      events.clearDownloads();
      expect(events.getDownloads()).toHaveLength(0);
    });

    it('drops downloads older than the TTL on read', () => {
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: { download: 'old', context: 'ctx-1', url: 'u', timestamp: 1 },
      });
      mock.emit({
        method: 'browsingContext.downloadWillBegin',
        params: { download: 'fresh', context: 'ctx-1', url: 'u' },
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0].id).toBe('fresh');
    });

    it('caps the buffer at MAX_DOWNLOADS, evicting the oldest first', () => {
      for (let i = 0; i < 501; i++) {
        mock.emit({
          method: 'browsingContext.downloadWillBegin',
          params: { download: `dl-${i}`, context: 'ctx-1', url: 'u' },
        });
      }

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(500);
      expect(downloads.some((d) => d.id === 'dl-0')).toBe(false);
      expect(downloads.some((d) => d.id === 'dl-500')).toBe(true);
    });
  });
});

function handlersEmitRaw(mock: ReturnType<typeof makeMockDriver>, raw: string) {
  const ws = mock.mockWs as any;
  const call = ws.on.mock.calls.find((c: any[]) => c[0] === 'message');
  call?.[1]?.(raw);
}
