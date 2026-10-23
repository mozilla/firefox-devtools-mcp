import EventEmitter from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadEvents } from '../../../../src/firefox/events/downloads.js';
import type { BiDiFacade } from '../../../../src/firefox/bidi.js';

// BiDi timestamps are epoch millis; anchor to now so the TTL cleanup keeps them.
const NOW = Date.now();

function makeMockBiDi() {
  return Object.assign(new EventEmitter(), {
    subscribe: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue(undefined),
  });
}

describe('DownloadEvents', () => {
  let mockBiDi: ReturnType<typeof makeMockBiDi>;
  let events: DownloadEvents;

  beforeEach(() => {
    mockBiDi = makeMockBiDi();
    events = new DownloadEvents(mockBiDi as unknown as BiDiFacade);
  });

  it('subscribe called twice only attaches one listener per event', async () => {
    await events.subscribe();
    await events.subscribe();
    expect(mockBiDi.listenerCount('browsingContext.downloadWillBegin')).toBe(1);
    expect(mockBiDi.listenerCount('browsingContext.downloadEnd')).toBe(1);
    expect(mockBiDi.subscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribe propagates when bidi.subscribe rejects', async () => {
    mockBiDi.subscribe.mockRejectedValue(new Error('unsupported event'));
    await expect(events.subscribe()).rejects.toThrow('unsupported event');
  });

  describe('event tracking', () => {
    beforeEach(async () => {
      await events.subscribe();
    });

    it('records an in-progress download on downloadWillBegin', () => {
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'dl-1',
        context: 'ctx-1',
        navigation: 'nav-1',
        url: 'https://example.com/file.zip',
        suggestedFilename: 'file.zip',
        timestamp: NOW,
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
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'dl-1',
        context: 'ctx-1',
        url: 'https://example.com/file.zip',
        suggestedFilename: 'file.zip',
        timestamp: NOW,
      });
      mockBiDi.emit('browsingContext.downloadEnd', {
        download: 'dl-1',
        context: 'ctx-1',
        status: 'complete',
        filepath: '/tmp/file.zip',
        timestamp: NOW + 500,
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
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        navigation: 'nav-1',
        context: 'ctx-1',
        url: 'https://example.com/file.zip',
        suggestedFilename: 'file.zip',
        timestamp: NOW,
      });
      mockBiDi.emit('browsingContext.downloadEnd', {
        navigation: 'nav-1',
        context: 'ctx-1',
        status: 'complete',
        filepath: '/tmp/file.zip',
        timestamp: NOW + 1000,
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({ id: 'nav-1', status: 'complete' });
    });

    it('falls back to a synthetic key when download and navigation ids are absent', () => {
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        context: 'ctx-1',
        url: 'https://example.com/file.zip',
        suggestedFilename: 'file.zip',
        timestamp: NOW,
      });
      mockBiDi.emit('browsingContext.downloadEnd', {
        context: 'ctx-1',
        status: 'complete',
        filepath: '/tmp/file.zip',
        timestamp: NOW + 200,
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({
        status: 'complete',
        filepath: '/tmp/file.zip',
      });
    });

    it('records a downloadEnd that arrives without a preceding willBegin', () => {
      mockBiDi.emit('browsingContext.downloadEnd', {
        download: 'dl-orphan',
        context: 'ctx-1',
        status: 'complete',
        filepath: '/tmp/orphan.zip',
        timestamp: NOW,
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
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'dl-1',
        context: 'ctx-1',
        url: 'https://example.com/f',
        timestamp: NOW,
      });
      mockBiDi.emit('browsingContext.downloadEnd', {
        download: 'dl-1',
        context: 'ctx-1',
        status: 'canceled',
        timestamp: NOW + 10,
      });

      expect(events.getDownloads()[0].filepath).toBeUndefined();
    });

    it('ignores events it did not subscribe to', () => {
      mockBiDi.emit('browsingContext.load', { context: 'ctx-1' });
      mockBiDi.emit('network.beforeRequestSent', { context: 'ctx-1' });
      expect(events.getDownloads()).toHaveLength(0);
    });

    it('clearDownloads empties the buffer', () => {
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'dl-1',
        context: 'ctx-1',
        url: 'u',
        timestamp: NOW,
      });
      expect(events.getDownloads()).toHaveLength(1);
      events.clearDownloads();
      expect(events.getDownloads()).toHaveLength(0);
    });

    it('drops downloads older than the TTL on read', () => {
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'old',
        context: 'ctx-1',
        url: 'u',
        timestamp: 1,
      });
      mockBiDi.emit('browsingContext.downloadWillBegin', {
        download: 'fresh',
        context: 'ctx-1',
        url: 'u',
      });

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(1);
      expect(downloads[0].id).toBe('fresh');
    });

    it('caps the buffer at MAX_DOWNLOADS, evicting the oldest first', () => {
      for (let i = 0; i < 501; i++) {
        mockBiDi.emit('browsingContext.downloadWillBegin', {
          download: `dl-${i}`,
          context: 'ctx-1',
          url: 'u',
        });
      }

      const downloads = events.getDownloads();
      expect(downloads).toHaveLength(500);
      expect(downloads.some((d) => d.id === 'dl-0')).toBe(false);
      expect(downloads.some((d) => d.id === 'dl-500')).toBe(true);
    });
  });
});
