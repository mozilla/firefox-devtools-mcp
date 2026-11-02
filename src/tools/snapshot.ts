/**
 * Snapshot tools for DOM structure capture with UID mapping
 */

import {
  successResponse,
  TOKEN_LIMITS,
  previewExcerpt,
  truncationFooter,
} from '../utils/response-helpers.js';
import { handleUidError } from '../utils/uid-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

const DEFAULT_SNAPSHOT_LINES = 100;

// Tool definitions
export const takeSnapshotTool = {
  name: 'take_snapshot',
  description:
    'Capture DOM snapshot with stable UIDs. A UID stays valid across snapshots until its element is removed or the page navigates. Output caps at maxLines (default 100); scope with selector or dump the full tree with saveTo.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      maxLines: {
        type: 'number',
        description: 'Max lines (default: 100)',
      },
      includeAttributes: {
        type: 'boolean',
        description: 'Include ARIA attributes (default: false)',
      },
      includeText: {
        type: 'boolean',
        description: 'Include text (default: true)',
      },
      maxDepth: {
        type: 'number',
        description: 'Max tree depth',
      },
      includeAll: {
        type: 'boolean',
        description:
          'Include all visible elements without relevance filtering. Useful for Vue/Livewire apps (default: false)',
      },
      selector: {
        type: 'string',
        description: 'CSS selector to scope snapshot to specific element (e.g., "#app")',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save the complete snapshot text to a file (ignores maxLines) instead of returning it inline. Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved output to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
  },
} as const satisfies ToolDefinition;

export const resolveUidToSelectorTool = {
  name: 'resolve_uid_to_selector',
  description: 'Resolve UID to CSS selector. Fails if the element is gone.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'UID from snapshot',
      },
    },
    required: ['uid'],
  },
} as const satisfies ToolDefinition;

export const clearSnapshotTool = {
  name: 'clear_snapshot',
  description: 'Clear snapshot UIDs. Usually not needed.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} as const satisfies ToolDefinition;

// Handlers
export const handleTakeSnapshot = defineToolHandler<typeof takeSnapshotTool>(
  async function handleTakeSnapshot(args): Promise<McpToolResponse> {
    try {
      const {
        maxLines: requestedMaxLines = DEFAULT_SNAPSHOT_LINES,
        includeAttributes = false,
        includeText = true,
        maxDepth,
        includeAll = false,
        selector,
        saveTo,
        preview,
      } = args ?? {};

      // Apply hard cap on maxLines to prevent token overflow
      const maxLines = Math.min(
        Math.max(1, requestedMaxLines),
        TOKEN_LIMITS.MAX_SNAPSHOT_LINES_CAP
      );
      const wasCapped = requestedMaxLines > TOKEN_LIMITS.MAX_SNAPSHOT_LINES_CAP;

      const { getFirefox } = await import('../index.js');
      const firefox = await getFirefox();

      // Pass snapshot options to manager
      const snapshotOptions: any = {};
      if (includeAll) {
        snapshotOptions.includeAll = includeAll;
      }
      if (selector) {
        snapshotOptions.selector = selector;
      }
      const snapshot = await firefox.takeSnapshot(
        Object.keys(snapshotOptions).length > 0 ? snapshotOptions : undefined
      );

      // Import formatter to apply custom options
      const { formatSnapshotTree } = await import('../firefox/snapshot/formatter.js');
      const options: any = {
        includeAttributes,
        includeText,
      };
      if (maxDepth !== undefined) {
        options.maxDepth = maxDepth;
      }
      // A saved snapshot is the complete tree, so keep attribute values untruncated.
      if (saveTo) {
        options.maxAttrLength = Infinity;
      }
      const formattedText = formatSnapshotTree(snapshot.json.root, 0, options);

      if (saveTo) {
        const saved = await saveOutput(
          formattedText,
          saveTo === true ? undefined : saveTo,
          'snapshot',
          'txt'
        );
        let output = `Snapshot saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
        if (snapshot.json.truncated) {
          output += ' [DOM truncated]';
        }
        const excerpt = previewExcerpt(formattedText, preview);
        if (excerpt) {
          output += '\nPreview:\n' + excerpt;
        }
        return successResponse(output);
      }

      // Get snapshot text (truncated if needed)
      const lines = formattedText.split('\n');

      const truncated = lines.length > maxLines;
      const displayLines = truncated ? lines.slice(0, maxLines) : lines;

      // Build compact output
      let output = 'Snapshot';
      if (selector) {
        output += ` [selector: ${selector}]`;
      }
      if (includeAll) {
        output += ' [includeAll: true]';
      }
      if (wasCapped) {
        output += ` [maxLines capped: ${TOKEN_LIMITS.MAX_SNAPSHOT_LINES_CAP}]`;
      }
      if (snapshot.json.truncated) {
        output += ' [DOM truncated]';
      }
      output += '\n\n';

      // Add snapshot tree
      output += displayLines.join('\n');

      if (truncated) {
        output +=
          '\n\n' +
          truncationFooter(lines.length - maxLines, 'lines', [
            'maxLines to show more',
            'selector to scope',
            'saveTo to dump the full tree to a file',
          ]);
      }

      return successResponse(output);
    } catch (error) {
      throw new Error(
        `Failed to take snapshot: ${(error as Error).message}\n\n` +
          'The page may not be fully loaded or accessible.'
      );
    }
  }
);

export const handleResolveUidToSelector = defineToolHandler<typeof resolveUidToSelectorTool>(
  async function handleResolveUidToSelector(args): Promise<McpToolResponse> {
    const { uid } = args;

    if (!uid || typeof uid !== 'string') {
      throw new Error('uid parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    try {
      const selector = await firefox.resolveUidToSelector(uid);
      return successResponse(`${uid} → ${selector}`);
    } catch (error) {
      throw handleUidError(error as Error, uid);
    }
  }
);

export const handleClearSnapshot = defineToolHandler<typeof clearSnapshotTool>(
  async function handleClearSnapshot(_args): Promise<McpToolResponse> {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await firefox.clearSnapshot();

    return successResponse('🧹 Snapshot cleared');
  }
);

export const module = defineModule({
  name: 'snapshot',
  description: 'Capture accessibility/DOM snapshots and resolve UIDs.',
  tools: [
    [takeSnapshotTool, handleTakeSnapshot],
    [resolveUidToSelectorTool, handleResolveUidToSelector],
    [clearSnapshotTool, handleClearSnapshot],
  ],
});
