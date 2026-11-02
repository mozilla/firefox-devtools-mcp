/**
 * Download tracking tools for Firefox DevTools MCP
 * Surfaces BiDi download events and controls download behavior
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { successResponse, errorResponse, jsonResponse } from '../utils/response-helpers.js';
import { outputDir } from '../utils/paths.js';
import { assertAllowedPath } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

// Tool definitions
export const listDownloadsTool = {
  name: 'list_downloads',
  description: 'List downloads tracked since startup, including status and saved file path.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
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
} as const satisfies ToolDefinition;

export const clearDownloadsTool = {
  name: 'clear_downloads',
  description: 'Clear the tracked downloads buffer.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
} as const satisfies ToolDefinition;

export const setDownloadBehaviorTool = {
  name: 'set_download_behavior',
  description:
    'Control how downloads are handled: allow (save to a destination folder), deny (cancel), or reset to default. Avoids the native save-file dialog. Requires a recent Firefox.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior: {
        type: 'string',
        enum: ['allowed', 'denied', 'default'],
        description:
          "'allowed' saves downloads to `downloadFolder`, 'denied' cancels them, 'default' resets to the browser default",
      },
      downloadFolder: {
        type: 'string',
        description:
          "Path to the folder where downloads should be stored, created if missing. Only used for behavior='allowed', where it defaults to ~/.firefox-devtools-mcp/output/downloads. Relative paths resolve against the current working directory.",
      },
    },
    required: ['behavior'],
  },
} as const satisfies ToolDefinition;

// Tool handlers
export const handleListDownloads = defineToolHandler<typeof listDownloadsTool>(
  async function handleListDownloads(args): Promise<McpToolResponse> {
    const { status, urlContains, limit = 50, format = 'text' } = args;

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
  }
);

export const handleClearDownloads = defineToolHandler<typeof clearDownloadsTool>(
  async function handleClearDownloads(): Promise<McpToolResponse> {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    firefox.clearDownloads();
    return successResponse('Downloads cleared.');
  }
);

export const handleSetDownloadBehavior = defineToolHandler<typeof setDownloadBehaviorTool>(
  async function handleSetDownloadBehavior(args): Promise<McpToolResponse> {
    const { behavior, downloadFolder } = args;

    if (!behavior) {
      return errorResponse('behavior is required');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    if (behavior === 'allowed') {
      // Firefox resolves relative paths against its own process cwd, which is unrelated to the
      // server's when attaching to an already running browser, so only ever send an absolute path.
      let folder = join(outputDir(), 'downloads');
      if (downloadFolder) {
        folder = resolve(downloadFolder);
        await assertAllowedPath(downloadFolder, folder, 'downloadFolder');
      }
      await mkdir(folder, { recursive: true });
      await firefox.setDownloadBehavior('allowed', folder);
      return successResponse(`Download behavior set to 'allowed' (folder='${folder}').`);
    }

    await firefox.setDownloadBehavior(behavior);
    return successResponse(`Download behavior set to '${behavior}'.`);
  }
);

export const module = defineModule({
  name: 'downloads',
  description: 'Monitor and manage file downloads.',
  tools: [
    [listDownloadsTool, handleListDownloads],
    [clearDownloadsTool, handleClearDownloads],
    [setDownloadBehaviorTool, handleSetDownloadBehavior],
  ],
});
