/**
 * Screenshot tools for visual capture
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { handleUidError } from '../utils/uid-helpers.js';
import type { McpToolResponse } from '../types/common.js';

const SAVE_TO_SCHEMA = {
  type: 'string',
  description:
    'Optional file path to save the screenshot to instead of returning it as image data in the response.',
} as const;

// Tool definitions
export const screenshotPageTool = {
  name: 'screenshot_page',
  description: 'Capture page screenshot as base64 PNG.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      saveTo: SAVE_TO_SCHEMA,
    },
  },
};

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
};

/**
 * Save screenshot to file and return text response with path.
 */
async function saveScreenshot(base64Png: string, saveTo: string): Promise<McpToolResponse> {
  const buffer = Buffer.from(base64Png, 'base64');
  const resolvedPath = resolve(saveTo);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, buffer);

  return successResponse(
    `Screenshot saved to: ${resolvedPath} (${(buffer.length / 1024).toFixed(1)}KB)`
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
export async function handleScreenshotPage(args: unknown): Promise<McpToolResponse> {
  try {
    const { saveTo } = (args ?? {}) as { saveTo?: string };

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const base64Png = await firefox.takeScreenshotPage();

    if (!base64Png || typeof base64Png !== 'string') {
      throw new Error('Invalid screenshot data');
    }

    if (saveTo) {
      return await saveScreenshot(base64Png, saveTo);
    }

    return imageResponse(base64Png);
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleScreenshotByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { uid, saveTo } = args as { uid: string; saveTo?: string };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}
