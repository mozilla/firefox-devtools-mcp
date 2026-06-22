/**
 * moz:debugging event handling
 */

import type { WebDriver } from 'selenium-webdriver';
import type { LogpointResult } from '../types.js';
import { logDebug } from '../../utils/logger.js';

const MAX_LOGPOINT_RESULTS = 100;

interface LogpointEntry {
  expression: string;
  location: { url: string; line: number };
  results: LogpointResult[];
  capped: boolean;
}

export class DebuggingEvents {
  private logpoints: Map<string, LogpointEntry> = new Map();
  private subscribed = false;

  constructor(
    private driver: WebDriver,
    private sendBiDiCommand: (method: string, params: Record<string, any>) => Promise<any>
  ) {}

  /**
   * Subscribe to moz:debugging events
   */
  async subscribe(contextId?: string): Promise<void> {
    if (this.subscribed) {
      return;
    }

    const bidi = await this.driver.getBidi();
    try {
      await bidi.subscribe('moz:debugging.paused', contextId ? [contextId] : undefined);
      await bidi.subscribe('moz:debugging.resumed', contextId ? [contextId] : undefined);
    } catch {
      logDebug(
        'Debugging events subscription skipped (may not be available in this Firefox version)'
      );
    }

    const ws: any = bidi.socket;
    ws.on('message', (data: any) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload?.method === 'moz:debugging.paused') {
          const { context, url, line, column } = payload.params;
          const logpointId = this.findLogpointByLocation(url, line);
          if (logpointId) {
            void this.handleLogpointPause(context, logpointId);
            return;
          }
          logDebug(`moz:Debugging paused in context: ${context} at ${url}:${line}:${column}`);
        }

        if (payload?.method === 'moz:debugging.resumed') {
          logDebug(`moz:Debugging resumed in context: ${payload.params.context}`);
        }
      } catch {
        // Ignore event processing failures
      }
    });

    this.subscribed = true;
    logDebug('moz:debugging listener active');
  }

  addLogpoint(logpointId: string, url: string, line: number, expression: string): void {
    this.logpoints.set(logpointId, {
      location: { url, line },
      expression,
      results: [],
      capped: false,
    });
  }

  removeLogpoint(logpointId: string): void {
    this.logpoints.delete(logpointId);
  }

  getLogpointResults(logpointId: string): LogpointResult[] | null {
    return this.logpoints.get(logpointId)?.results ?? null;
  }

  private findLogpointByLocation(url: string, line: number): string | null {
    for (const [logpointId, entry] of this.logpoints) {
      if (entry.location.url === url && entry.location.line === line) {
        return logpointId;
      }
    }
    return null;
  }

  private async handleLogpointPause(contextId: string, logpointId: string): Promise<void> {
    const entry = this.logpoints.get(logpointId);
    if (!entry) {
      return;
    }

    logDebug(`Logpoint hit: ${logpointId} in context ${contextId}`);

    try {
      // Bug 2047506: script.callFunction fails when paused, use script.evaluate
      // for now.
      const result = await this.sendBiDiCommand('script.evaluate', {
        expression: entry.expression,
        target: { context: contextId },
        awaitPromise: false,
      });

      const evalResult = result as {
        type: string;
        result?: unknown;
        exceptionDetails?: { text: string };
      };

      if (evalResult.type === 'exception') {
        entry.results.push({
          value: null,
          error: evalResult.exceptionDetails?.text ?? 'Unknown error',
          timestamp: Date.now(),
        });
      } else {
        entry.results.push({
          value: evalResult.result,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      entry.results.push({
        value: null,
        error: String(error),
        timestamp: Date.now(),
      });
    } finally {
      if (entry.results.length > MAX_LOGPOINT_RESULTS) {
        entry.results.splice(0, entry.results.length - MAX_LOGPOINT_RESULTS);
        if (!entry.capped) {
          entry.capped = true;
          logDebug(`Logpoint ${logpointId}: result buffer capped at ${MAX_LOGPOINT_RESULTS}`);
        }
      }
      await this.sendBiDiCommand('moz:debugging.resume', { context: contextId }).catch((err) => {
        logDebug(`Failed to resume after logpoint: ${String(err)}`);
      });
    }
  }
}
