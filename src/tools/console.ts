/**
 * Console tools for MCP
 */

import {
  successResponse,
  jsonResponse,
  TOKEN_LIMITS,
  truncateText,
  previewExcerpt,
  truncationFooter,
} from '../utils/response-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

export const listConsoleMessagesTool = {
  name: 'list_console_messages',
  description:
    'List console messages, filterable by level, time, text, source. Caps at limit (default 50); saveTo saves all matches to a file.',
  annotations: {
    readOnlyHint: true,
  },
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
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save matching messages to a file in full (untruncated) instead of returning them inline. Saves all matching messages by default; pass an explicit limit to cap how many are saved. Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved output to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
  },
} as const satisfies ToolDefinition;

export const clearConsoleMessagesTool = {
  name: 'clear_console_messages',
  description: 'Clear collected console messages.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} as const satisfies ToolDefinition;

const DEFAULT_LIMIT = 50;

function formatMessageLine(msg: {
  level: string;
  text: string;
  source?: string | undefined;
  timestamp?: number | undefined;
}): string {
  const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : '';
  const source = msg.source ? ` [${msg.source}]` : '';
  const time = timestamp ? `[${timestamp}] ` : '';
  return `${time}${msg.level.toUpperCase()}${source}: ${msg.text}`;
}

export const handleListConsoleMessages = defineToolHandler<typeof listConsoleMessagesTool>(
  async (args): Promise<McpToolResponse> => {
    const { level, limit, sinceMs, textContains, source, format = 'text', saveTo, preview } = args;

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

    if (saveTo) {
      const selected = limit !== undefined ? messages.slice(0, limit) : messages;
      const fileBody =
        format === 'json'
          ? JSON.stringify(
              {
                total: totalCount,
                filtered: messages.length,
                saved: selected.length,
                messages: selected.map((msg) => ({
                  level: msg.level,
                  text: msg.text,
                  source: msg.source || null,
                  timestamp: msg.timestamp || null,
                })),
              },
              null,
              2
            )
          : selected.map(formatMessageLine).join('\n');
      const saved = await saveOutput(
        fileBody,
        saveTo === true ? undefined : saveTo,
        'console-messages',
        format === 'json' ? 'json' : 'txt'
      );
      let output = `Console messages saved to: ${saved.path} (${selected.length} of ${messages.length} matching, ${totalCount} total, ${(saved.bytes / 1024).toFixed(1)}KB)`;
      const excerpt = previewExcerpt(fileBody, preview);
      if (excerpt) {
        output += '\nPreview:\n' + excerpt;
      }
      return successResponse(output);
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
      output += `${formatMessageLine(msg)}\n`;
    }

    if (truncated) {
      output +=
        '\n' +
        truncationFooter(filteredCount - messages.length, 'messages', [
          'limit to show more',
          'level/textContains/source to filter',
          'saveTo to save all to a file',
        ]);
    }

    return successResponse(output);
  }
);

export const handleClearConsoleMessages = defineToolHandler<typeof clearConsoleMessagesTool>(
  async (_args): Promise<McpToolResponse> => {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const count = (await firefox.getConsoleMessages()).length;
    firefox.clearConsoleMessages();

    return successResponse(`cleared ${count} messages`);
  }
);

export const module = defineModule({
  name: 'console',
  description: 'Read and clear console messages.',
  tools: [
    [listConsoleMessagesTool, handleListConsoleMessages],
    [clearConsoleMessagesTool, handleClearConsoleMessages],
  ],
});
