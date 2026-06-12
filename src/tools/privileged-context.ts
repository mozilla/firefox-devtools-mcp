/**
 * Privileged context management tools for MCP
 * Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { validateFunction } from '../utils/js-validation.js';
import { remoteValueToNative } from '../utils/remote-value.js';
import type { McpToolResponse } from '../types/common.js';

export const listPrivilegedContextsTool = {
  name: 'list_privileged_contexts',
  description:
    'List privileged (privileged) browsing contexts. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var. Use restart_firefox with env parameter to enable.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const selectPrivilegedContextTool = {
  name: 'select_privileged_context',
  description:
    'Select a privileged browsing context by ID and set WebDriver Classic context to "chrome" . Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var.',
  inputSchema: {
    type: 'object',
    properties: {
      contextId: {
        type: 'string',
        description: 'Privileged browsing context ID from list_privileged_contexts',
      },
    },
    required: ['contextId'],
  },
};

export const evaluatePrivilegedScriptTool = {
  name: 'evaluate_privileged_script',
  description:
    'Execute JS function in the current privileged context. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var. Use select_privileged_context first to target a chrome context.',
  inputSchema: {
    type: 'object',
    properties: {
      function: {
        type: 'string',
        description: 'JS function string, e.g. () => Services.prefs.getBoolPref("foo")',
      },
    },
    required: ['function'],
  },
};

function formatContextList(contexts: any[]): string {
  if (contexts.length === 0) {
    return 'No privileged contexts found';
  }

  const lines: string[] = [`${contexts.length} privileged contexts`];
  for (const ctx of contexts) {
    const id = ctx.context;
    const url = ctx.url || '(no url)';
    const children = ctx.children ? ` [${ctx.children.length} children]` : '';
    lines.push(`  ${id}: ${url}${children}`);
  }
  return lines.join('\n');
}

export async function handleListPrivilegedContexts(_args: unknown): Promise<McpToolResponse> {
  try {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const result = await firefox.sendBiDiCommand('browsingContext.getTree', {
      'moz:scope': 'chrome',
    });

    const contexts = result.contexts || [];

    return successResponse(formatContextList(contexts));
  } catch (error) {
    if (error instanceof Error && error.message.includes('UnsupportedOperationError')) {
      return errorResponse(
        new Error(
          'Privileged context access not enabled. Set MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 environment variable and restart Firefox.'
        )
      );
    }
    return errorResponse(error as Error);
  }
}

export async function handleSelectPrivilegedContext(args: unknown): Promise<McpToolResponse> {
  try {
    const { contextId } = args as { contextId: string };

    if (!contextId || typeof contextId !== 'string') {
      throw new Error('contextId parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const driver = firefox.getDriver();
    await driver.switchTo().window(contextId);

    try {
      await driver.setContext('chrome');
    } catch {
      return errorResponse(
        new Error(
          `Switched to context ${contextId} but failed to set Marionette privileged context. Your Firefox build may not support privileged context or MOZ_REMOTE_ALLOW_SYSTEM_ACCESS is not set.`
        )
      );
    }

    // Update tracked context so helper tools (set_firefox_prefs, list_extensions)
    // restore to this context instead of the old content context.
    firefox.setCurrentContextId(contextId);

    return successResponse(
      `Switched to privileged context: ${contextId} (Marionette context set to privileged)`
    );
  } catch (error) {
    return errorResponse(error as Error);
  }
}

const EvaluateResultType = {
  Exception: 'exception',
  Success: 'success',
};

export async function handleEvaluatePrivilegedScript(args: unknown): Promise<McpToolResponse> {
  try {
    const { function: fnString } = args as { function: string };

    validateFunction(fnString);

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const result = await firefox.sendBiDiCommand('script.callFunction', {
      functionDeclaration: fnString,
      awaitPromise: true,
      arguments: [],
      target: { context: firefox.getCurrentContextId() },
    });

    if (result.type === EvaluateResultType.Success) {
      let output = 'Script ran in chrome context and returned:\n';
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
