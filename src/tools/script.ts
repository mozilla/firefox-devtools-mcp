/**
 * JavaScript evaluation tool
 */

import type { Script } from 'webdriver-bidi-protocol';
import { successResponse, errorResponse, previewExcerpt } from '../utils/response-helpers.js';
import { remoteValueToNative } from '../utils/remote-value.js';
import { validateFunction } from '../utils/js-validation.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

export const evaluateScriptTool = {
  name: 'evaluate_script',
  description:
    'Run a JS function in the page and return its result. Prefer this for targeted reads (a value, text, computed style, whether an element exists) instead of a full take_snapshot. Use the UID interaction tools for clicking, typing, and filling.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      function: {
        type: 'string',
        description: 'JS function string, e.g. () => document.title',
      },
      args: {
        type: 'array',
        description: 'UIDs to pass as function arguments',
        items: {
          type: 'object',
          properties: {
            uid: {
              type: 'string',
              description: 'Element UID from snapshot',
            },
          },
          required: ['uid'],
        },
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms (default: 5000)',
      },
      sandbox: {
        type: 'string',
        description:
          'Evaluate in an isolated sandbox realm with this name instead of the page realm. The sandbox shares the page DOM and keeps the native built-ins even where the page overrode them. Page-defined globals and expandos are invisible from the sandbox, and vice-versa. The same name reuses the same sandbox across calls; omit to evaluate in the page realm.',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save the result to a file as JSON instead of returning it inline. Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved result to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
    required: ['function'],
  },
} satisfies ToolDefinition;

// Constants
const DEFAULT_TIMEOUT = 5000; // 5 seconds
const TIMEOUT = Symbol('Timeout');

export const handleEvaluateScript = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const {
      function: fnString,
      args: fnArgs,
      timeout,
      sandbox,
      saveTo,
      preview,
    } = args as {
      function: string;
      args?: Array<{ uid: string }>;
      timeout?: number;
      sandbox?: string;
      saveTo?: boolean | string;
      preview?: number;
    };

    // Validate function
    validateFunction(fnString);

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const scriptTimeout = timeout ?? DEFAULT_TIMEOUT;

    // Prepare arguments: resolve UIDs to references shared ids if provided
    const resolvedArgs: Script.LocalValue[] = [];
    if (fnArgs && fnArgs.length > 0) {
      for (const arg of fnArgs) {
        try {
          const element = await firefox.resolveUidToElement(arg.uid);
          resolvedArgs.push({ sharedId: await element.getId() });
        } catch (error) {
          const errorMsg = (error as Error).message;

          // Provide friendly error for stale UIDs
          if (
            errorMsg.includes('stale') ||
            errorMsg.includes('Snapshot') ||
            errorMsg.includes('UID')
          ) {
            throw new Error(
              `UID "${arg.uid}" is invalid or from an old snapshot.\n\n` +
                'The page may have changed since the snapshot was taken.\n' +
                'Please call take_snapshot to get fresh UIDs and try again.'
            );
          }

          throw new Error(`Failed to resolve UID "${arg.uid}": ${errorMsg}`);
        }
      }
    }

    // Execute with resolved args (empty array if no args)
    const context = firefox.getCurrentContextId();
    if (!context) {
      throw new Error('No active browsing context');
    }
    const callFunctionPromise = firefox.sendBiDiCommand('script.callFunction', {
      functionDeclaration: fnString,
      awaitPromise: true,
      arguments: resolvedArgs,
      target: {
        context,
        ...(sandbox !== undefined && { sandbox }),
      },
    });

    // Race against timeout as WebDriver BiDi callFunction has no built-in
    // timeout feature.
    const result = await Promise.race([
      new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), scriptTimeout)),
      callFunctionPromise,
    ]);

    if (result === TIMEOUT) {
      return errorResponse(
        new Error(
          `Script execution timed out (exceeded ${scriptTimeout}ms).\n\n` +
            'The function may contain an infinite loop or be waiting for a slow operation.\n' +
            'Try simplifying the script or increasing the timeout parameter.'
        )
      );
    } else if (result.type === 'success') {
      // JSON.stringify returns undefined for an undefined script result
      const json = JSON.stringify(remoteValueToNative(result.result), null, 2) ?? 'undefined';

      if (saveTo) {
        const saved = await saveOutput(
          json,
          saveTo === true ? undefined : saveTo,
          'evaluate-script'
        );
        let output = `Script ran on page. Result saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
        const excerpt = previewExcerpt(json, preview);
        if (excerpt) {
          output += '\nPreview:\n```json\n' + excerpt + '\n```';
        }
        return successResponse(output);
      }

      return successResponse('Script ran on page and returned:\n```json\n' + json + '\n```');
    } else {
      const exceptionDetails = result.exceptionDetails;
      return errorResponse(
        new Error(
          `Script execution failed: ${exceptionDetails.text}\n\n` +
            '```json\n' +
            JSON.stringify(remoteValueToNative(exceptionDetails.exception), null, 2) +
            '\n```'
        )
      );
    }
  }
);

export const module = defineModule({
  name: 'script',
  description: 'Evaluate arbitrary JavaScript in the page context.',
  tools: [[evaluateScriptTool, handleEvaluateScript]],
});
