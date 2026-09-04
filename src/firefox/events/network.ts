/**
 * Network event handling with lifecycle hooks
 */

import type { Network } from 'webdriver-bidi-protocol';
import { DataType, type BiDiFacade } from '../bidi.js';
import { logDebug } from '../../utils/logger.js';

// Memory protection constants
const MAX_NETWORK_REQUESTS = 1000; // Maximum number of requests to keep
const NETWORK_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for old requests

// Per-body cap for the BiDi data collector. Bodies larger than this are not
// retained (Firefox also enforces a shared session-wide budget with eviction).
const MAX_ENCODED_DATA_SIZE = 10 * 1000 * 1000; // 10 MB

export interface NetworkEventsOptions {
  /** Auto-clear network requests on navigation (default: true when monitoring is enabled) */
  autoClearOnNavigate?: boolean;
  /** Register a data collector so request/response bodies can be fetched (default: true) */
  captureBodies?: boolean;
}

/** Outcome of fetching a request/response body via the BiDi data collector. */
export type NetworkBodyResult =
  | { ok: true; type: 'base64' | 'string'; value: string }
  | { ok: false; reason: 'unsupported' | 'not-collected' | 'evicted' | 'aborted' | 'error' };

export class NetworkEvents {
  private networkRecords: Map<string, any> = new Map();
  private subscribed = false;
  private enabled = false;
  private requestStartTimes: Map<string, number> = new Map();
  private options: NetworkEventsOptions;
  private collectorId: string | null = null;

  constructor(
    private bidi: BiDiFacade,
    options: NetworkEventsOptions = {}
  ) {
    this.options = {
      autoClearOnNavigate: true,
      ...options,
    };
  }

  /**
   * Subscribe to BiDi network events and navigation lifecycle
   * Enables monitoring by default (always-on capture)
   */
  async subscribe(): Promise<void> {
    if (this.subscribed) {
      return;
    }

    // Subscribe to network events
    await this.bidi.subscribe([
      'network.beforeRequestSent',
      'network.responseStarted',
      'network.responseCompleted',
    ]);

    // Subscribe to navigation events for lifecycle hooks
    await this.bidi.subscribe(['browsingContext.load', 'browsingContext.domContentLoaded']);

    const onLoadEvent = () => {
      // Only clear if monitoring is enabled and autoClear is on
      if (this.enabled && this.options.autoClearOnNavigate) {
        this.clearRequests();
      }
    };
    this.bidi.on('browsingContext.domContentLoaded', onLoadEvent);
    this.bidi.on('browsingContext.load', onLoadEvent);

    this.bidi.on('network.beforeRequestSent', (req) => {
      // Only collect network events when explicitly enabled
      if (!this.enabled) {
        return;
      }

      const requestId = req.request.request;

      if (!requestId) {
        return;
      }

      this.requestStartTimes.set(requestId, Date.now());

      const record = {
        id: requestId,
        url: req.request.url,
        method: req.request.method,
        timestamp: Date.now(),
        resourceType: this.guessResourceType(req.request.url),
        isXHR:
          req.request.initiatorType === 'xmlhttprequest' || req.request.initiatorType === 'fetch',
        requestHeaders: this.parseHeaders(req.request.headers),
        timings: {
          requestTime: Date.now(),
        },
      };

      this.networkRecords.set(requestId, record);
      logDebug(`Network request [${record.method}]: ${record.url}`);
    });

    this.bidi.on('network.responseStarted', (resp) => {
      // Only collect network events when explicitly enabled
      if (!this.enabled) {
        return;
      }

      const requestId = resp.request?.request;

      if (!requestId) {
        return;
      }

      const existing = this.networkRecords.get(requestId);
      if (existing) {
        existing.status = resp.response?.status;
        existing.statusText = resp.response?.statusText || '';
        existing.responseHeaders = this.parseHeaders(resp.response?.headers || []);
      }
    });

    this.bidi.on('network.responseCompleted', (resp) => {
      // Only collect network events when explicitly enabled
      if (!this.enabled) {
        return;
      }

      const requestId = resp.request?.request;

      if (!requestId) {
        return;
      }

      const existing = this.networkRecords.get(requestId);
      const startTime = this.requestStartTimes.get(requestId);

      if (existing && startTime) {
        existing.timings.responseTime = Date.now();
        existing.timings.duration = Date.now() - startTime;

        if (!existing.status && resp.response?.status) {
          existing.status = resp.response.status;
          existing.statusText = resp.response.statusText || '';
        }
      }

      this.requestStartTimes.delete(requestId);
    });

    await this.registerDataCollector();

    this.subscribed = true;

    // Enable monitoring by default (always-on)
    this.enabled = true;
    logDebug('Network listener ready with lifecycle hooks (monitoring enabled by default)');
  }

  /**
   * Register a BiDi network data collector for request and response bodies.
   * Failures are non-fatal and simply leave body capture disabled.
   */
  private async registerDataCollector(): Promise<void> {
    if (this.options.captureBodies === false) {
      logDebug('Network body capture disabled, skipping data collector registration');
      return;
    }

    try {
      const result = await this.bidi.sendCommand('network.addDataCollector', {
        dataTypes: [DataType.Request, DataType.Response],
        maxEncodedDataSize: MAX_ENCODED_DATA_SIZE,
      });
      this.collectorId = result?.collector ?? null;
      if (this.collectorId) {
        logDebug(`Network data collector registered (${this.collectorId})`);
      }
    } catch (error) {
      logDebug(
        `Network data collector unavailable, response bodies will not be captured: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Fetch a captured request or response body via network.getData.
   * Returns a structured result so callers can render an appropriate marker
   * when the body was never collected, evicted, or the browser lacks support.
   */
  async fetchBody(requestId: string, dataType: Network.DataType): Promise<NetworkBodyResult> {
    if (!this.collectorId) {
      return { ok: false, reason: 'unsupported' };
    }

    try {
      const result = await this.bidi.sendCommand('network.getData', {
        request: requestId,
        dataType,
      });
      const bytes = result?.bytes;
      if (!bytes || typeof bytes.value !== 'string') {
        return { ok: false, reason: 'not-collected' };
      }
      return {
        ok: true,
        type: bytes.type === 'base64' ? 'base64' : 'string',
        value: bytes.value,
      };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (message.includes('no such network data')) {
        return { ok: false, reason: 'not-collected' };
      }
      if (message.includes('unavailable network data')) {
        // reason for unavailable network data errors can be either evicted or
        // aborted in Firefox (see https://searchfox.org/firefox-main/rev/d573d849c063353bda3a67541ab219c8a548773a/remote/webdriver-bidi/modules/root/network.sys.mjs#396-399)
        if (message.includes('evicted')) {
          return { ok: false, reason: 'evicted' };
        }
        if (message.includes('aborted')) {
          return { ok: false, reason: 'aborted' };
        }
      }
      return { ok: false, reason: 'error' };
    }
  }

  /**
   * Start collecting network requests
   */
  startMonitoring(): void {
    this.enabled = true;
    logDebug('Network monitoring started');
  }

  /**
   * Stop collecting network requests
   */
  stopMonitoring(): void {
    this.enabled = false;
    logDebug('Network monitoring stopped');
  }

  /**
   * Get all collected network requests
   */
  getRequests(): any[] {
    this.cleanupOldRequests();
    return Array.from(this.networkRecords.values());
  }

  /**
   * Clear network request buffer
   */
  clearRequests(): void {
    this.networkRecords.clear();
    this.requestStartTimes.clear();
    logDebug('Network requests cleared');
  }

  /**
   * Remove old requests based on TTL and buffer size limit
   */
  private cleanupOldRequests(): void {
    const now = Date.now();
    const cutoffTime = now - NETWORK_TTL_MS;

    // Remove requests older than TTL
    const entriesToRemove: string[] = [];
    for (const [id, record] of this.networkRecords.entries()) {
      if (record.timestamp && record.timestamp < cutoffTime) {
        entriesToRemove.push(id);
      }
    }

    for (const id of entriesToRemove) {
      this.networkRecords.delete(id);
      this.requestStartTimes.delete(id);
    }

    // Enforce max buffer size (keep most recent requests)
    if (this.networkRecords.size > MAX_NETWORK_REQUESTS) {
      const excess = this.networkRecords.size - MAX_NETWORK_REQUESTS;

      // Sort by timestamp (oldest first) and remove oldest
      const sorted = Array.from(this.networkRecords.entries()).sort((a, b) => {
        const timeA = a[1].timestamp || 0;
        const timeB = b[1].timestamp || 0;
        return timeA - timeB;
      });

      for (let i = 0; i < excess; i++) {
        const entry = sorted[i];
        if (entry) {
          const [id] = entry;
          this.networkRecords.delete(id);
          this.requestStartTimes.delete(id);
        }
      }

      logDebug(
        `Network buffer limit reached: removed ${excess} oldest request(s) (max: ${MAX_NETWORK_REQUESTS})`
      );
    }
  }

  /**
   * Guess resource type from URL
   */
  private guessResourceType(url: string): string {
    const pathPart = url.split('?')[0];
    if (!pathPart) {
      return 'document';
    }

    const parts = pathPart.split('.');
    const ext = (parts.length > 1 ? parts[parts.length - 1] || '' : '').toLowerCase();

    if (['js', 'mjs'].includes(ext)) {
      return 'script';
    }
    if (['css'].includes(ext)) {
      return 'stylesheet';
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext)) {
      return 'image';
    }
    if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) {
      return 'font';
    }
    if (['mp4', 'webm', 'ogg'].includes(ext)) {
      return 'media';
    }
    if (url.includes('/api/') || url.includes('.json')) {
      return 'xhr';
    }

    return 'document';
  }

  /**
   * Parse BiDi headers array to object
   */
  private parseHeaders(headers: any[]): Record<string, string> {
    const result: Record<string, string> = {};

    const normalizeValue = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (Array.isArray(value)) {
        const parts = value
          .map((item) => normalizeValue(item))
          .filter((item): item is string => !!item);
        return parts.length > 0 ? parts.join(', ') : null;
      }
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if ('value' in obj) {
          return normalizeValue(obj.value);
        }
        if ('bytes' in obj) {
          return normalizeValue(obj.bytes);
        }
        try {
          return JSON.stringify(obj);
        } catch {
          return null;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return String(value);
    };

    if (Array.isArray(headers)) {
      for (const h of headers) {
        const name = h?.name ? String(h.name).toLowerCase() : '';
        if (!name) {
          continue;
        }

        const normalizedValue = normalizeValue(h?.value);
        if (normalizedValue !== null) {
          result[name] = normalizedValue;
        }
      }
    }

    return result;
  }
}
