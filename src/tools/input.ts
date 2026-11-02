/**
 * UID-based input interaction tools
 * Require valid UIDs from take_snapshot
 */

import { successResponse } from '../utils/response-helpers.js';
import { handleUidError } from '../utils/uid-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

// Tool definitions
export const clickByUidTool = {
  name: 'click_by_uid',
  description: 'Click element by UID. Set dblClick for double-click.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'Element UID from snapshot',
      },
      dblClick: {
        type: 'boolean',
        description: 'Double-click (default: false)',
      },
    },
    required: ['uid'],
  },
} as const satisfies ToolDefinition;

export const hoverByUidTool = {
  name: 'hover_by_uid',
  description: 'Hover over element by UID.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'Element UID from snapshot',
      },
    },
    required: ['uid'],
  },
} as const satisfies ToolDefinition;

export const fillByUidTool = {
  name: 'fill_by_uid',
  description: 'Fill text input/textarea by UID.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'Input element UID from snapshot',
      },
      value: {
        type: 'string',
        description: 'Text to fill',
      },
    },
    required: ['uid', 'value'],
  },
} as const satisfies ToolDefinition;

export const dragByUidToUidTool = {
  name: 'drag_by_uid_to_uid',
  description: 'Drag element to another (HTML5 drag events).',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      fromUid: {
        type: 'string',
        description: 'Source element UID',
      },
      toUid: {
        type: 'string',
        description: 'Target element UID',
      },
    },
    required: ['fromUid', 'toUid'],
  },
} as const satisfies ToolDefinition;

export const fillFormByUidTool = {
  name: 'fill_form_by_uid',
  description: 'Fill multiple form fields at once.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        description: 'Array of {uid, value} pairs',
        items: {
          type: 'object',
          properties: {
            uid: {
              type: 'string',
              description: 'Field UID',
            },
            value: {
              type: 'string',
              description: 'Field value',
            },
          },
          required: ['uid', 'value'],
        },
      },
    },
    required: ['elements'],
  },
} as const satisfies ToolDefinition;

export const uploadFileByUidTool = {
  name: 'upload_file_by_uid',
  description: 'Upload file to file input by UID.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'File input UID from snapshot',
      },
      filePath: {
        type: 'string',
        description: 'Local file path',
      },
    },
    required: ['uid', 'filePath'],
  },
} as const satisfies ToolDefinition;

export const pressKeyTool = {
  name: 'press_key',
  description:
    'Press a single key, optionally with modifiers, to submit, dismiss, navigate or trigger a shortcut. Not for entering text: use fill_by_uid instead.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'One key, optionally preceded by "+"-separated modifiers, such as "Escape", "Enter" or "ctrl+shift+t". Modifiers: ctrl, alt, shift, meta. Named keys: Enter, Return, NumpadEnter, Tab, Backspace, Delete, Insert, Space, Escape, Home, End, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, F1-F12, Numpad0-Numpad9, Clear, Pause, Help, Cancel, Semicolon, Equals, Add, Subtract, Multiply, Divide, Decimal, Separator. Anything else must be a single character. Any number of modifiers, but only one key.',
      },
      uid: {
        type: 'string',
        description:
          'Focusable element UID from snapshot to focus before pressing (default: the already focused element)',
      },
    },
    required: ['key'],
  },
} as const satisfies ToolDefinition;

export const typeTextTool = {
  name: 'type_text',
  description:
    'Type text key by key into the focused element, optionally followed by a key such as Enter. Use fill_by_uid to set the value of a known input; use this for elements that only react to real typing, such as autocomplete fields and rich text editors.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to type',
      },
      uid: {
        type: 'string',
        description:
          'Focusable element UID from snapshot to focus before typing (default: the already focused element)',
      },
      submitKey: {
        type: 'string',
        description:
          'Key to press after the text, such as "Enter" or "Tab". Same syntax as press_key.',
      },
    },
    required: ['text'],
  },
} as const satisfies ToolDefinition;

// Handlers
export const handleClickByUid = defineToolHandler<typeof clickByUidTool>(
  async function handleClickByUid(args): Promise<McpToolResponse> {
    const { uid, dblClick } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.clickByUid(uid, dblClick);
      return successResponse(`${dblClick ? 'dblclick' : 'click'} ${uid}`);
    } catch (error) {
      throw handleUidError(error as Error, uid);
    }
  }
);

export const handleHoverByUid = defineToolHandler<typeof hoverByUidTool>(
  async function handleHoverByUid(args): Promise<McpToolResponse> {
    const { uid } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.hoverByUid(uid);
      return successResponse(`hover ${uid}`);
    } catch (error) {
      throw handleUidError(error as Error, uid);
    }
  }
);

export const handleFillByUid = defineToolHandler<typeof fillByUidTool>(
  async function handleFillByUid(args): Promise<McpToolResponse> {
    const { uid, value } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid parameter is required and must be a string');
    }

    if (value === undefined || typeof value !== 'string') {
      throw new Error('value parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.fillByUid(uid, value);
      return successResponse(`fill ${uid}`);
    } catch (error) {
      throw handleUidError(error as Error, uid);
    }
  }
);

export const handleDragByUidToUid = defineToolHandler<typeof dragByUidToUidTool>(
  async function handleDragByUidToUid(args): Promise<McpToolResponse> {
    const { fromUid, toUid } = args;

    if (!fromUid || typeof fromUid !== 'string') {
      throw new Error('fromUid parameter is required and must be a string');
    }

    if (!toUid || typeof toUid !== 'string') {
      throw new Error('toUid parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.dragByUidToUid(fromUid, toUid);
      return successResponse(`drag ${fromUid}→${toUid}`);
    } catch (error) {
      // Check both UIDs for staleness
      const errorMsg = (error as Error).message;
      if (errorMsg.includes('stale') || errorMsg.includes('Snapshot') || errorMsg.includes('UID')) {
        throw new Error(`UIDs stale/invalid. Call take_snapshot first.`);
      }
      throw error;
    }
  }
);

export const handleFillFormByUid = defineToolHandler<typeof fillFormByUidTool>(
  async function handleFillFormByUid(args): Promise<McpToolResponse> {
    const { elements } = args;

    if (!elements || !Array.isArray(elements) || elements.length === 0) {
      throw new Error('elements parameter is required and must be a non-empty array');
    }

    // Validate all elements
    for (const el of elements) {
      if (!el.uid || typeof el.uid !== 'string') {
        throw new Error(`Invalid element: uid is required and must be a string`);
      }
      if (el.value === undefined || typeof el.value !== 'string') {
        throw new Error(`Invalid element for uid "${el.uid}": value must be a string`);
      }
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.fillFormByUid(elements);
      return successResponse(`filled ${elements.length} fields`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (errorMsg.includes('stale') || errorMsg.includes('Snapshot') || errorMsg.includes('UID')) {
        throw new Error(`UIDs stale/invalid. Call take_snapshot first.`);
      }
      throw error;
    }
  }
);

export const handleUploadFileByUid = defineToolHandler<typeof uploadFileByUidTool>(
  async function handleUploadFileByUid(args): Promise<McpToolResponse> {
    const { uid, filePath } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid parameter is required and must be a string');
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.uploadFileByUid(uid, filePath);
      return successResponse(`upload ${uid}`);
    } catch (error) {
      const errorMsg = (error as Error).message;

      // Check for UID staleness
      if (errorMsg.includes('stale') || errorMsg.includes('Snapshot') || errorMsg.includes('UID')) {
        throw handleUidError(error as Error, uid);
      }

      // Check for file input specific errors
      if (errorMsg.includes('not a file input') || errorMsg.includes('type="file"')) {
        throw new Error(`${uid} is not a file input`);
      }

      if (errorMsg.includes('hidden') || errorMsg.includes('not visible')) {
        throw new Error(`${uid} is hidden/not interactable`);
      }

      throw error;
    }
  }
);

export const handlePressKey = defineToolHandler<typeof pressKeyTool>(
  async function handlePressKey(args): Promise<McpToolResponse> {
    const { key, uid } = args;

    if (!key || typeof key !== 'string') {
      throw new Error('key parameter is required and must be a string');
    }

    if (uid !== undefined && (!uid || typeof uid !== 'string')) {
      throw new Error('uid parameter must be a non-empty string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.pressKey(key, uid);
      return successResponse(uid ? `press_key ${key} on ${uid}` : `press_key ${key}`);
    } catch (error) {
      if (uid) {
        throw handleUidError(error as Error, uid);
      }
      throw error;
    }
  }
);

export const handleTypeText = defineToolHandler<typeof typeTextTool>(
  async function handleTypeText(args): Promise<McpToolResponse> {
    const { text, uid, submitKey } = args;

    if (!text || typeof text !== 'string') {
      throw new Error('text parameter is required and must be a non-empty string');
    }

    if (uid !== undefined && (!uid || typeof uid !== 'string')) {
      throw new Error('uid parameter must be a non-empty string');
    }

    if (submitKey !== undefined && (!submitKey || typeof submitKey !== 'string')) {
      throw new Error('submitKey parameter must be a non-empty string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.typeText(text, { uid, submitKey });
      const target = uid ? ` on ${uid}` : '';
      const suffix = submitKey ? `, then ${submitKey}` : '';
      return successResponse(`type_text ${text.length} chars${target}${suffix}`);
    } catch (error) {
      if (uid) {
        throw handleUidError(error as Error, uid);
      }
      throw error;
    }
  }
);

export const module = defineModule({
  name: 'input',
  description:
    'Interact with the page via UID-based clicks, typing, key presses, drag, and uploads.',
  tools: [
    [clickByUidTool, handleClickByUid],
    [hoverByUidTool, handleHoverByUid],
    [fillByUidTool, handleFillByUid],
    [dragByUidToUidTool, handleDragByUidToUid],
    [fillFormByUidTool, handleFillFormByUid],
    [uploadFileByUidTool, handleUploadFileByUid],
    [pressKeyTool, handlePressKey],
    [typeTextTool, handleTypeText],
  ],
});
