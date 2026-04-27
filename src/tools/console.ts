/**
 * Console tools for MCP
 */

import {
  successResponse,
  errorResponse,
  jsonResponse,
  TOKEN_LIMITS,
  truncateText,
} from '../utils/response-helpers.js';
import type { McpToolResponse } from '../types/common.js';

export const listConsoleMessagesTool = {
  name: 'list_console_messages',
  description: 'List console messages. Supports filtering by level, time, text, source.',
  inputSchema: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        enum: ['debug', 'info', 'warn', 'error'],
        description: 'Filter by level',
      },
      limit: {
        type: 'number',
        description: 'Max messages (default: 50)',
      },
      sinceMs: {
        type: 'number',
        description: 'Only last N ms',
      },
      textContains: {
        type: 'string',
        description: 'Text filter (case-insensitive)',
      },
      source: {
        type: 'string',
        description: 'Filter by source',
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: 'Output format (default: text)',
      },
    },
  },
};

export const clearConsoleMessagesTool = {
  name: 'clear_console_messages',
  description: 'Clear collected console messages.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const DEFAULT_LIMIT = 50;

export async function handleListConsoleMessages(args: unknown): Promise<McpToolResponse> {
  try {
    const {
      level,
      limit,
      sinceMs,
      textContains,
      source,
      format = 'text',
    } = (args as {
      level?: string;
      limit?: number;
      sinceMs?: number;
      textContains?: string;
      source?: string;
      format?: 'text' | 'json';
    }) || {};

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    let messages = await firefox.getConsoleMessages();
    const totalCount = messages.length;

    // Apply filters
    if (level) {
      messages = messages.filter((msg) => msg.level.toLowerCase() === level.toLowerCase());
    }

    if (sinceMs !== undefined) {
      const cutoffTime = Date.now() - sinceMs;
      messages = messages.filter((msg) => msg.timestamp && msg.timestamp >= cutoffTime);
    }

    if (textContains) {
      const textLower = textContains.toLowerCase();
      messages = messages.filter((msg) => msg.text.toLowerCase().includes(textLower));
    }

    if (source) {
      messages = messages.filter((msg) => msg.source?.toLowerCase() === source.toLowerCase());
    }

    // Truncate individual message texts to prevent token overflow
    messages = messages.map((msg) => ({
      ...msg,
      text: truncateText(msg.text, TOKEN_LIMITS.MAX_CONSOLE_MESSAGE_CHARS, '...[truncated]'),
    }));

    // Apply limit
    const maxLimit = limit ?? DEFAULT_LIMIT;
    const filteredCount = messages.length;
    const truncated = messages.length > maxLimit;
    messages = messages.slice(0, maxLimit);

    if (messages.length === 0) {
      const filterInfo = [];
      if (level) {
        filterInfo.push(`level=${level}`);
      }
      if (sinceMs) {
        filterInfo.push(`sinceMs=${sinceMs}`);
      }
      if (textContains) {
        filterInfo.push(`textContains="${textContains}"`);
      }
      if (source) {
        filterInfo.push(`source="${source}"`);
      }

      if (format === 'json') {
        return jsonResponse({
          total: totalCount,
          filtered: 0,
          showing: 0,
          filters: filterInfo.length > 0 ? filterInfo.join(', ') : null,
          messages: [],
        });
      }

      return successResponse(
        `No console messages found matching filters.\n` +
          `Total messages: ${totalCount}${filterInfo.length > 0 ? `, Filters: ${filterInfo.join(', ')}` : ''}`
      );
    }

    // JSON format
    if (format === 'json') {
      const filterInfo = [];
      if (level) {
        filterInfo.push(`level=${level}`);
      }
      if (sinceMs) {
        filterInfo.push(`sinceMs=${sinceMs}`);
      }
      if (textContains) {
        filterInfo.push(`textContains="${textContains}"`);
      }
      if (source) {
        filterInfo.push(`source="${source}"`);
      }

      return jsonResponse({
        total: totalCount,
        filtered: filteredCount,
        showing: messages.length,
        hasMore: truncated,
        filters: filterInfo.length > 0 ? filterInfo.join(', ') : null,
        messages: messages.map((msg) => ({
          level: msg.level,
          text: msg.text,
          source: msg.source || null,
          timestamp: msg.timestamp || null,
        })),
      });
    }

    // Format messages as text
    let output = `Console messages (showing ${messages.length}`;
    if (filteredCount > messages.length) {
      output += ` of ${filteredCount} matching`;
    }
    output += `, ${totalCount} total):\n`;

    if (level || sinceMs || textContains || source) {
      output += `Filters:`;
      if (level) {
        output += ` level=${level}`;
      }
      if (sinceMs) {
        output += ` sinceMs=${sinceMs}`;
      }
      if (textContains) {
        output += ` textContains="${textContains}"`;
      }
      if (source) {
        output += ` source="${source}"`;
      }
      output += '\n';
    }
    output += '\n';

    for (const msg of messages) {
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : '';
      const source = msg.source ? ` [${msg.source}]` : '';
      const time = timestamp ? `[${timestamp}] ` : '';

      output += `${time}${msg.level.toUpperCase()}${source}: ${msg.text}\n`;
    }

    if (truncated) {
      output += `\n[+${filteredCount - messages.length} more]`;
    }

    return successResponse(output);
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleClearConsoleMessages(_args: unknown): Promise<McpToolResponse> {
  try {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const count = (await firefox.getConsoleMessages()).length;
    firefox.clearConsoleMessages();

    return successResponse(`cleared ${count} messages`);
  } catch (error) {
    return errorResponse(error as Error);
  }
}
