/**
 * Download tracking tools for Firefox DevTools MCP
 * Surfaces BiDi download events and controls download behavior
 */

import { successResponse, errorResponse, jsonResponse } from '../utils/response-helpers.js';
import type { McpToolResponse } from '../types/common.js';

// Tool definitions
export const listDownloadsTool = {
  name: 'list_downloads',
  description: 'List downloads tracked since startup, including status and saved file path.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['in_progress', 'complete', 'canceled'],
        description: 'Filter by status',
      },
      urlContains: {
        type: 'string',
        description: 'URL filter (case-insensitive)',
      },
      limit: {
        type: 'number',
        description: 'Max downloads (default: 50)',
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: 'Output format (default: text)',
      },
    },
  },
};

export const clearDownloadsTool = {
  name: 'clear_downloads',
  description: 'Clear the tracked downloads buffer.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export const setDownloadBehaviorTool = {
  name: 'set_download_behavior',
  description:
    'Control how downloads are handled: allow (save silently to a folder), deny (cancel), or reset to default. Avoids the native save-file dialog. Requires a recent Firefox.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      behavior: {
        type: 'string',
        enum: ['allowed', 'denied', 'default'],
        description:
          "'allowed' saves downloads automatically, 'denied' cancels them, 'default' resets to the browser default",
      },
      destinationFolder: {
        type: 'string',
        description: 'Absolute path to save downloads (only used with behavior=allowed)',
      },
    },
    required: ['behavior'],
  },
};

// Tool handlers
export async function handleListDownloads(args: unknown): Promise<McpToolResponse> {
  try {
    const {
      status,
      urlContains,
      limit = 50,
      format = 'text',
    } = (args ?? {}) as {
      status?: string;
      urlContains?: string;
      limit?: number;
      format?: string;
    };

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    let downloads = firefox.getDownloads();

    if (status) {
      downloads = downloads.filter((d) => d.status === status);
    }
    if (urlContains) {
      const needle = urlContains.toLowerCase();
      downloads = downloads.filter((d) => (d.url || '').toLowerCase().includes(needle));
    }

    downloads = downloads
      .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
      .slice(0, limit);

    if (format === 'json') {
      return jsonResponse(downloads);
    }

    if (downloads.length === 0) {
      return successResponse('No downloads tracked.');
    }

    const lines = downloads.map((d) => {
      const where = d.filepath ? ` -> ${d.filepath}` : '';
      return `[${d.status}] ${d.suggestedFilename || d.url}${where}`;
    });
    return successResponse(lines.join('\n'));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleClearDownloads(): Promise<McpToolResponse> {
  try {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    firefox.clearDownloads();
    return successResponse('Downloads cleared.');
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleSetDownloadBehavior(args: unknown): Promise<McpToolResponse> {
  try {
    const { behavior, destinationFolder } = (args ?? {}) as {
      behavior?: 'allowed' | 'denied' | 'default';
      destinationFolder?: string;
    };

    if (!behavior) {
      return errorResponse('behavior is required');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    await firefox.setDownloadBehavior(behavior, destinationFolder);

    const suffix =
      behavior === 'allowed' && destinationFolder ? ` (folder: ${destinationFolder})` : '';
    return successResponse(`Download behavior set to '${behavior}'${suffix}.`);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}
