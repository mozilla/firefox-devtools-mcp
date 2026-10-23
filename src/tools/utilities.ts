/**
 * Page utility tools (dialogs, history, viewport)
 */

import { successResponse } from '../utils/response-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

// Tool definitions - Dialogs
export const acceptDialogTool = {
  name: 'accept_dialog',
  description: 'Accept browser dialog. Provide promptText for prompts.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      promptText: {
        type: 'string',
        description: 'Text for prompt dialogs',
      },
    },
  },
} satisfies ToolDefinition;

export const dismissDialogTool = {
  name: 'dismiss_dialog',
  description: 'Dismiss browser dialog.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} satisfies ToolDefinition;

// Tool definitions - History
export const navigateHistoryTool = {
  name: 'navigate_history',
  description: 'Navigate history back/forward. UIDs become stale.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['back', 'forward'],
        description: 'back or forward',
      },
    },
    required: ['direction'],
  },
} satisfies ToolDefinition;

// Tool definitions - Viewport
export const setViewportSizeTool = {
  name: 'set_viewport_size',
  description: 'Set viewport dimensions in pixels. Applies to the selected tab only.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      width: {
        type: 'number',
        description: 'Width in pixels',
      },
      height: {
        type: 'number',
        description: 'Height in pixels',
      },
    },
    required: ['width', 'height'],
  },
} satisfies ToolDefinition;

// Handlers - Dialogs
export const handleAcceptDialog = defineToolHandler(async function handleAcceptDialog(
  args: unknown
): Promise<McpToolResponse> {
  const { promptText } = (args as { promptText?: string }) || {};

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  try {
    await firefox.acceptDialog(promptText);
    return successResponse(promptText ? `Accepted: "${promptText}"` : 'Accepted');
  } catch (error) {
    const errorMsg = (error as Error).message;

    // Concise error for no active dialog
    if (errorMsg.includes('no such alert') || errorMsg.includes('No dialog')) {
      throw new Error('No active dialog');
    }

    throw error;
  }
});

export const handleDismissDialog = defineToolHandler(async function handleDismissDialog(
  _args: unknown
): Promise<McpToolResponse> {
  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  try {
    await firefox.dismissDialog();
    return successResponse('Dismissed');
  } catch (error) {
    const errorMsg = (error as Error).message;

    // Concise error for no active dialog
    if (errorMsg.includes('no such alert') || errorMsg.includes('No dialog')) {
      throw new Error('No active dialog');
    }

    throw error;
  }
});

// Handlers - History
export const handleNavigateHistory = defineToolHandler(async function handleNavigateHistory(
  args: unknown
): Promise<McpToolResponse> {
  const { direction } = args as { direction: 'back' | 'forward' };

  if (!direction || (direction !== 'back' && direction !== 'forward')) {
    throw new Error('direction parameter is required and must be "back" or "forward"');
  }

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  if (direction === 'back') {
    await firefox.navigateBack();
  } else {
    await firefox.navigateForward();
  }

  return successResponse(`${direction}`);
});

// Handlers - Viewport
export const handleSetViewportSize = defineToolHandler(async function handleSetViewportSize(
  args: unknown
): Promise<McpToolResponse> {
  const { width, height } = args as { width: number; height: number };

  if (typeof width !== 'number' || width <= 0) {
    throw new Error('width parameter is required and must be a positive number');
  }

  if (typeof height !== 'number' || height <= 0) {
    throw new Error('height parameter is required and must be a positive number');
  }

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  await firefox.setViewportSize(width, height);

  return successResponse(`${width}x${height}`);
});

export const module = defineModule({
  name: 'utilities',
  description: 'Handle dialogs, history navigation, and viewport sizing.',
  tools: [
    [acceptDialogTool, handleAcceptDialog],
    [dismissDialogTool, handleDismissDialog],
    [navigateHistoryTool, handleNavigateHistory],
    [setViewportSizeTool, handleSetViewportSize],
  ],
});
