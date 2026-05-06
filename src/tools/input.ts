/**
 * UID-based input interaction tools
 * Require valid UIDs from take_snapshot
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { handleUidError } from '../utils/uid-helpers.js';
import type { McpToolResponse } from '../types/common.js';

// Tool definitions
export const clickByUidTool = {
  name: 'click_by_uid',
  description: 'Click element by UID. Set dblClick for double-click.',
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
};

export const hoverByUidTool = {
  name: 'hover_by_uid',
  description: 'Hover over element by UID.',
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
};

export const fillByUidTool = {
  name: 'fill_by_uid',
  description: 'Fill text input/textarea by UID.',
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
};

export const dragByUidToUidTool = {
  name: 'drag_by_uid_to_uid',
  description: 'Drag element to another (HTML5 drag events).',
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
};

export const fillFormByUidTool = {
  name: 'fill_form_by_uid',
  description: 'Fill multiple form fields at once.',
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
};

export const uploadFileByUidTool = {
  name: 'upload_file_by_uid',
  description: 'Upload file to file input by UID.',
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
};

export const pressKeyTool = {
  name: 'press_key',
  description:
    'Press a keyboard key or key combination in the browser. Use this to submit forms (Enter), dismiss dialogs (Escape), navigate (Tab, arrow keys), trigger shortcuts (ctrl+l, ctrl+f, ctrl+shift+t), or press function keys (F5, F12). If uid is provided the key is sent to that element; otherwise it goes to the currently focused element.',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'Key name or combination. Named keys: Enter, Escape, Tab, Backspace, Delete, Space, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, F1–F12. Modifiers: ctrl, alt, shift, meta. Combine with +, e.g. "ctrl+l", "ctrl+shift+t", "alt+F4".',
      },
      uid: {
        type: 'string',
        description: 'Element UID from snapshot (optional). If omitted, sends to active element.',
      },
    },
    required: ['key'],
  },
};

// Handlers
export async function handleClickByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { uid, dblClick } = args as { uid: string; dblClick?: boolean };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleHoverByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { uid } = args as { uid: string };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleFillByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { uid, value } = args as { uid: string; value: string };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleDragByUidToUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { fromUid, toUid } = args as { fromUid: string; toUid: string };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleFillFormByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { elements } = args as { elements: Array<{ uid: string; value: string }> };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleUploadFileByUid(args: unknown): Promise<McpToolResponse> {
  try {
    const { uid, filePath } = args as { uid: string; filePath: string };

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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handlePressKey(args: unknown): Promise<McpToolResponse> {
  try {
    const { key, uid } = args as { key: string; uid?: string };

    if (!key || typeof key !== 'string') {
      throw new Error('key parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      await firefox.pressKey(key, uid);
      return successResponse(uid ? `✅ press_key "${key}" on ${uid}` : `✅ press_key "${key}"`);
    } catch (error) {
      if (uid) {
        throw handleUidError(error as Error, uid);
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error as Error);
  }
}
