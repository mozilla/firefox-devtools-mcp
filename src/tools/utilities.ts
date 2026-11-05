/**
 * Page utility tools (dialogs, history, viewport)
 */

import { successResponse } from '../utils/response-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { BrowsingContext } from 'webdriver-bidi-protocol';
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
} as const satisfies ToolDefinition;

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
} as const satisfies ToolDefinition;

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
} as const satisfies ToolDefinition;

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
} as const satisfies ToolDefinition;

// Handlers - Dialogs
export const handleAcceptDialog = defineToolHandler<typeof acceptDialogTool>(
  async function handleAcceptDialog(args): Promise<McpToolResponse> {
    const { promptText } = args;

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    const dialog = firefox.getCurrentDialog();
    const value = !dialog
      ? promptText
      : (dialog.type as string) === 'prompt'
        ? (promptText ?? dialog.defaultValue)
        : undefined;

    await firefox.acceptDialog(value);
    return successResponse(value !== undefined ? `Accepted: "${value}"` : 'Accepted');
  }
);

export const handleDismissDialog = defineToolHandler<typeof dismissDialogTool>(
  async function handleDismissDialog(_args): Promise<McpToolResponse> {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await firefox.dismissDialog();
    return successResponse('Dismissed');
  }
);

export function dialogOpenedResponse(dialog: BrowsingContext.UserPromptOpenedParameters) {
  const defaultValue =
    dialog.defaultValue !== undefined ? ` with default value "${dialog.defaultValue}"` : '';
  return successResponse(
    `Dialog opened while tool was running: ${dialog.type} "${dialog.message}"${defaultValue}. Use accept_dialog or dismiss_dialog.`
  );
}

// Handlers - History
export const handleNavigateHistory = defineToolHandler<typeof navigateHistoryTool>(
  async function handleNavigateHistory(args): Promise<McpToolResponse> {
    const { direction } = args;

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
  }
);

// Handlers - Viewport
export const handleSetViewportSize = defineToolHandler<typeof setViewportSizeTool>(
  async function handleSetViewportSize(args): Promise<McpToolResponse> {
    const { width, height } = args;

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
  }
);

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
