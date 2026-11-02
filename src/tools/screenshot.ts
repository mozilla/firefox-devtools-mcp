/**
 * Screenshot tools for visual capture
 */

import { successResponse } from '../utils/response-helpers.js';
import { handleUidError } from '../utils/uid-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

const SAVE_TO_SCHEMA = {
  type: ['boolean', 'string'],
  description:
    'Save the screenshot to a file instead of returning it as image data in the response. Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
} as const;

// Tool definitions
export const screenshotPageTool = {
  name: 'screenshot_page',
  description:
    'Capture viewport screenshot as base64 PNG. Set fullPage for the whole scrollable document.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      fullPage: {
        type: 'boolean',
        description: 'Capture the whole scrollable document (default: false)',
      },
      saveTo: SAVE_TO_SCHEMA,
    },
  },
} as const satisfies ToolDefinition;

export const screenshotByUidTool = {
  name: 'screenshot_by_uid',
  description: 'Capture element screenshot by UID as base64 PNG.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'Element UID from snapshot',
      },
      saveTo: SAVE_TO_SCHEMA,
    },
    required: ['uid'],
  },
} as const satisfies ToolDefinition;

/**
 * Save screenshot to file and return text response with path.
 */
async function saveScreenshot(base64Png: string, saveTo: true | string): Promise<McpToolResponse> {
  const buffer = Buffer.from(base64Png, 'base64');
  const saved = await saveOutput(buffer, saveTo === true ? undefined : saveTo, 'screenshot', 'png');

  return successResponse(
    `Screenshot saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`
  );
}

/**
 * Return screenshot as native image content for GUI MCP clients.
 */
function imageResponse(base64Png: string): McpToolResponse {
  return {
    content: [
      {
        type: 'image',
        data: base64Png,
        mimeType: 'image/png',
      },
    ],
  };
}

// Handlers
export const handleScreenshotPage = defineToolHandler<typeof screenshotPageTool>(
  async function handleScreenshotPage(args): Promise<McpToolResponse> {
    const { fullPage, saveTo } = args;

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const base64Png = await firefox.takeScreenshotPage(fullPage === true);

    if (!base64Png || typeof base64Png !== 'string') {
      throw new Error('Invalid screenshot data');
    }

    if (saveTo) {
      return await saveScreenshot(base64Png, saveTo);
    }

    return imageResponse(base64Png);
  }
);

export const handleScreenshotByUid = defineToolHandler<typeof screenshotByUidTool>(
  async function handleScreenshotByUid(args): Promise<McpToolResponse> {
    const { uid, saveTo } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid required');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      const base64Png = await firefox.takeScreenshotByUid(uid);

      if (!base64Png || typeof base64Png !== 'string') {
        throw new Error('Invalid screenshot data');
      }

      if (saveTo) {
        return await saveScreenshot(base64Png, saveTo);
      }

      return imageResponse(base64Png);
    } catch (error) {
      throw handleUidError(error as Error, uid);
    }
  }
);

export const module = defineModule({
  name: 'screenshot',
  description: 'Capture screenshots of the page or specific elements.',
  tools: [
    [screenshotPageTool, handleScreenshotPage],
    [screenshotByUidTool, handleScreenshotByUid],
  ],
});
