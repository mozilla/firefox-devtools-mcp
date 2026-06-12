/**
 * JavaScript evaluation tool
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { remoteValueToNative } from '../utils/remote-value.js';
import type { McpToolResponse } from '../types/common.js';

export const evaluateScriptTool = {
  name: 'evaluate_script',
  description: 'Execute JS function in page. Prefer UID tools for interactions.',
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
    },
    required: ['function'],
  },
};

// Constants
const MAX_FUNCTION_SIZE = 16 * 1024; // 16 KB
const DEFAULT_TIMEOUT = 5000; // 5 seconds
const TIMEOUT = Symbol('Timeout');

// Types from the WebDriver BiDi specification.
const EvaluateResultType = {
  Exception: 'exception',
  Success: 'success',
};

/**
 * Validate function string format
 */
function validateFunction(fnString: string): void {
  if (!fnString || typeof fnString !== 'string') {
    throw new Error('function parameter is required and must be a string');
  }

  if (fnString.length > MAX_FUNCTION_SIZE) {
    throw new Error(
      `Function too large (${fnString.length} bytes, max ${MAX_FUNCTION_SIZE} bytes). ` +
        'This tool is not designed for massive scripts.'
    );
  }

  // Check if it looks like a function or arrow function
  const trimmed = fnString.trim();
  const isFunctionLike =
    trimmed.startsWith('function') ||
    trimmed.startsWith('async function') ||
    trimmed.startsWith('(') ||
    trimmed.startsWith('async (');

  if (!isFunctionLike) {
    throw new Error(
      `Invalid function format. Expected a function or arrow function, got: "${trimmed.substring(0, 50)}...".\n\n` +
        'Valid examples:\n' +
        '  () => document.title\n' +
        '  async () => { return await fetch("/api") }\n' +
        '  (el) => el.innerText\n' +
        '  function() { return window.location.href }'
    );
  }
}

export async function handleEvaluateScript(args: unknown): Promise<McpToolResponse> {
  try {
    const {
      function: fnString,
      args: fnArgs,
      timeout,
    } = args as {
      function: string;
      args?: Array<{ uid: string }>;
      timeout?: number;
    };

    // Validate function
    validateFunction(fnString);

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const scriptTimeout = timeout ?? DEFAULT_TIMEOUT;

    // Prepare arguments: resolve UIDs to references shared ids if provided
    const resolvedArgs: unknown[] = [];
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
    const callFunctionPromise = firefox.sendBiDiCommand('script.callFunction', {
      functionDeclaration: fnString,
      awaitPromise: true,
      arguments: resolvedArgs,
      target: { context: firefox.getCurrentContextId() },
    });

    // Race against timeout as WebDriver BiDi callFunction has no built-in
    // timeout feature.
    const result = await Promise.race([
      new Promise((r) => setTimeout(() => r(TIMEOUT), scriptTimeout)),
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
    } else if (result.type === EvaluateResultType.Success) {
      // Format output
      let output = 'Script ran on page and returned:\n';
      output += '```json\n';
      output += JSON.stringify(remoteValueToNative(result.result), null, 2);
      output += '\n```';

      return successResponse(output);
    } else if (result.type === EvaluateResultType.Exception) {
      const exceptionDetails = result.exceptionDetails;
      return errorResponse(
        new Error(
          `Script execution failed: ${exceptionDetails.text}\n\n` +
            '```json\n' +
            JSON.stringify(remoteValueToNative(exceptionDetails.exception), null, 2) +
            '\n```'
        )
      );
    } else {
      return errorResponse(`Unexpected script.callFunction result type: ${result.type}`);
    }
  } catch (error) {
    return errorResponse(error as Error);
  }
}
