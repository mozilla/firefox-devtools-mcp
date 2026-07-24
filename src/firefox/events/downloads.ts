/**
 * Download events.
 */

import type { WebDriver } from 'selenium-webdriver';
import { logDebug } from '../../utils/logger.js';

const MAX_DOWNLOADS = 500;
const DOWNLOAD_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL for old downloads

export class DownloadEvents {
  private downloads: Map<string, any> = new Map();
  private subscribed = false;

  // Used only as a fallback for Firefox < 154, where downloads lack a specific
  // id, and might also not have a navigation id. Can be removed once Firefox
  // 153 is no longer supported.
  private fallbackCounter = 0;
  private pendingFallbackKey: string | null = null;

  constructor(private driver: WebDriver) {}

  /**
   * Subscribe to BiDi download events.
   */
  async subscribe(contextId?: string): Promise<void> {
    if (this.subscribed) {
      return;
    }

    const bidi = await this.driver.getBidi();
    const contexts = contextId ? [contextId] : undefined;

    await bidi.subscribe('browsingContext.downloadWillBegin', contexts);
    await bidi.subscribe('browsingContext.downloadEnd', contexts);

    const ws: any = bidi.socket;
    ws.on('message', (data: any) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload?.method === 'browsingContext.downloadWillBegin') {
          const p = payload.params;
          // Bug 2040936 added support for download ids in Firefox 154. For
          // older versions of Firefox, fallback to navigation or a counter
          // based id.
          let key = p.download ?? p.navigation;
          if (!key) {
            key = `download-${this.fallbackCounter++}`;
            this.pendingFallbackKey = key;
          }

          this.downloads.set(key, {
            id: key,
            context: p.context,
            navigation: p.navigation ?? null,
            url: p.url || '',
            suggestedFilename: p.suggestedFilename || '',
            status: 'in_progress',
            startTimestamp: p.timestamp ?? Date.now(),
          });
          logDebug(`Download started: filename=${p.suggestedFilename}, url=${p.url}, id=${key}`);
        }

        if (payload?.method === 'browsingContext.downloadEnd') {
          const p = payload.params;
          let key = p?.download ?? p?.navigation;
          if (!key) {
            key = this.pendingFallbackKey ?? `download-${this.fallbackCounter++}`;
            this.pendingFallbackKey = null;
          }

          const existing = this.downloads.get(key) ?? {
            id: key,
            context: p.context,
            navigation: p.navigation ?? null,
            url: p.url || '',
            suggestedFilename: '',
            status: 'in_progress',
            startTimestamp: p.timestamp ?? Date.now(),
          };

          existing.status = p.status; // 'complete' | 'canceled'
          existing.endTimestamp = p.timestamp ?? Date.now();
          existing.durationMs = existing.endTimestamp - existing.startTimestamp;
          if (p.status === 'complete' && p.filepath) {
            existing.filepath = p.filepath;
          }

          this.downloads.set(key, existing);
          logDebug(
            `Download ${p.status}: filepath=${existing.filepath}, url=${existing.url}, id=${key}`
          );
        }
      } catch {
        // Ignore parse errors
      }
    });

    this.subscribed = true;
    logDebug('Download listener ready');
  }

  /**
   * Get all tracked downloads
   */
  getDownloads(): any[] {
    this.cleanupOldDownloads();
    return Array.from(this.downloads.values());
  }

  /**
   * Clear the tracked downloads buffer
   */
  clearDownloads(): void {
    this.downloads.clear();
    logDebug('Downloads cleared');
  }

  /**
   * Remove old downloads based on TTL and buffer size limit
   */
  private cleanupOldDownloads(): void {
    const cutoffTime = Date.now() - DOWNLOAD_TTL_MS;

    for (const [id, record] of this.downloads.entries()) {
      if (record.startTimestamp && record.startTimestamp < cutoffTime) {
        this.downloads.delete(id);
      }
    }

    if (this.downloads.size > MAX_DOWNLOADS) {
      const excess = this.downloads.size - MAX_DOWNLOADS;

      const sorted = Array.from(this.downloads.entries()).sort(
        (a, b) => (a[1].startTimestamp || 0) - (b[1].startTimestamp || 0)
      );

      for (let i = 0; i < excess; i++) {
        const entry = sorted[i];
        if (entry) {
          this.downloads.delete(entry[0]);
        }
      }

      logDebug(
        `Download buffer limit reached: removed ${excess} oldest download(s) (max: ${MAX_DOWNLOADS})`
      );
    }
  }
}
