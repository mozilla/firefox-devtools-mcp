/**
 * Console event handling with lifecycle hooks
 */

import type { BiDiFacade } from '../bidi.js';
import type { ConsoleMessage } from '../types.js';
import { logDebug } from '../../utils/logger.js';

// Memory protection constants
const MAX_CONSOLE_MESSAGES = 1000; // Maximum number of messages to keep
const CONSOLE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for old messages

export interface ConsoleEventsOptions {
  /** Auto-clear console on navigation (default: false - changed to prevent losing logs) */
  autoClearOnNavigate?: boolean;
}

export class ConsoleEvents {
  private consoleMessages: ConsoleMessage[] = [];
  private subscribed = false;
  private options: ConsoleEventsOptions;

  constructor(
    private bidi: BiDiFacade,
    options: ConsoleEventsOptions = {}
  ) {
    this.options = {
      autoClearOnNavigate: false, // Changed default to false to preserve logs across tabs
      ...options,
    };
  }

  /**
   * Subscribe to BiDi console events and navigation lifecycle
   */
  async subscribe(): Promise<void> {
    if (this.subscribed) {
      return;
    }

    await this.bidi.subscribe('log.entryAdded');

    // Subscribe to navigation events for lifecycle hooks
    await this.bidi.subscribe(['browsingContext.load', 'browsingContext.domContentLoaded']);

    this.bidi.on('log.entryAdded', (entry) => {
      const message: ConsoleMessage = {
        level: entry.level || 'info',
        text: entry.text || ('args' in entry && entry.args ? JSON.stringify(entry.args) : ''),
        timestamp: entry.timestamp || Date.now(),
        source: entry.source?.realm,
        args: 'args' in entry ? entry.args : [],
      };
      this.consoleMessages.push(message);
      logDebug(`Console [${message.level}]: ${message.text}`);
    });

    // Handle navigation lifecycle events
    if (this.options.autoClearOnNavigate) {
      this.bidi.on('browsingContext.load', () => this.clearMessages());
      this.bidi.on('browsingContext.domContentLoaded', () => this.clearMessages());
    }

    this.subscribed = true;
    logDebug('Console listener active with lifecycle hooks');
  }

  /**
   * Get all collected console messages
   */
  getMessages(): ConsoleMessage[] {
    this.cleanupOldMessages();
    return [...this.consoleMessages];
  }

  /**
   * Clear console messages (e.g., on navigation)
   */
  clearMessages(): void {
    this.consoleMessages = [];
  }

  /**
   * Remove old messages based on TTL and buffer size limit
   */
  private cleanupOldMessages(): void {
    const now = Date.now();
    const cutoffTime = now - CONSOLE_TTL_MS;

    // Remove messages older than TTL
    this.consoleMessages = this.consoleMessages.filter(
      (msg) => msg.timestamp && msg.timestamp >= cutoffTime
    );

    // Enforce max buffer size (keep most recent messages)
    if (this.consoleMessages.length > MAX_CONSOLE_MESSAGES) {
      const excess = this.consoleMessages.length - MAX_CONSOLE_MESSAGES;
      this.consoleMessages.splice(0, excess);
      logDebug(
        `Console buffer limit reached: removed ${excess} oldest message(s) (max: ${MAX_CONSOLE_MESSAGES})`
      );
    }
  }
}
