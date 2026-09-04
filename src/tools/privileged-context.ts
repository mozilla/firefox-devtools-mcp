/**
 * Privileged context management tools for MCP
 * Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1
 */

import { successResponse, errorResponse, previewExcerpt } from '../utils/response-helpers.js';
import { validateFunction } from '../utils/js-validation.js';
import { remoteValueToNative } from '../utils/remote-value.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
// list_extensions lives with the other extension tools in webextension.ts, but
// it needs parent access (AddonManager), so it is registered here under the
// privileged module rather than the unprivileged webextension module.
import { listExtensionsTool, handleListExtensions } from './webextension.js';
import type { McpToolResponse } from '../types/common.js';

export const listPrivilegedContextsTool = {
  name: 'list_privileged_contexts',
  description:
    'List privileged (privileged) browsing contexts. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var. Use restart_firefox with env parameter to enable.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} satisfies ToolDefinition;

export const selectPrivilegedContextTool = {
  name: 'select_privileged_context',
  description:
    'Select a privileged browsing context by ID and set WebDriver Classic context to "chrome" . Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var.',
  annotations: {
    readOnlyHint: false,
  },
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
} satisfies ToolDefinition;

export const evaluatePrivilegedScriptTool = {
  name: 'evaluate_privileged_script',
  description:
    'Execute JS function in a privileged (chrome) browsing context. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var. Get context ids from list_privileged_contexts.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      function: {
        type: 'string',
        description: 'JS function string, e.g. () => Services.prefs.getBoolPref("foo")',
      },
      context: {
        type: 'string',
        description: 'Privileged browsing context ID from list_privileged_contexts',
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
    required: ['function', 'context'],
  },
} satisfies ToolDefinition;

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

const SYSTEM_ACCESS_ERROR =
  'Privileged context access not enabled. Set MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 environment variable and restart Firefox.';

// Top-level entries of the chrome-scoped tree are the privileged contexts;
// their children are content tabs and must not be accepted.
async function assertPrivilegedContext(firefox: any, contextId: string): Promise<void> {
  let result;
  try {
    result = await firefox.sendBiDiCommand('browsingContext.getTree', {
      'moz:scope': 'chrome',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UnsupportedOperationError')) {
      throw new Error(SYSTEM_ACCESS_ERROR);
    }
    throw error;
  }
  const contexts: any[] = result.contexts || [];
  if (!contexts.some((ctx) => ctx.context === contextId)) {
    throw new Error(
      `${contextId} is not a privileged context. Use list_privileged_contexts to see valid ids.`
    );
  }
}

export const handleListPrivilegedContexts = defineToolHandler(
  async (_args: unknown): Promise<McpToolResponse> => {
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
        throw new Error(SYSTEM_ACCESS_ERROR);
      }
      throw error;
    }
  }
);

export const handleSelectPrivilegedContext = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { contextId } = args as { contextId: string };

    if (!contextId || typeof contextId !== 'string') {
      throw new Error('contextId parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await assertPrivilegedContext(firefox, contextId);

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
  }
);

export const handleEvaluatePrivilegedScript = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const {
      function: fnString,
      context,
      saveTo,
      preview,
    } = args as {
      function: string;
      context: string;
      saveTo?: boolean | string;
      preview?: number;
    };

    validateFunction(fnString);

    if (!context || typeof context !== 'string') {
      throw new Error('context parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await assertPrivilegedContext(firefox, context);

    const result = await firefox.sendBiDiCommand('script.callFunction', {
      functionDeclaration: fnString,
      awaitPromise: true,
      arguments: [],
      target: { context },
    });

    if (result.type === 'success') {
      // JSON.stringify returns undefined for an undefined script result
      const json = JSON.stringify(remoteValueToNative(result.result), null, 2) ?? 'undefined';

      if (saveTo) {
        const saved = await saveOutput(
          json,
          saveTo === true ? undefined : saveTo,
          'evaluate-privileged'
        );
        let output = `Script ran in chrome context. Result saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
        const excerpt = previewExcerpt(json, preview);
        if (excerpt) {
          output += '\nPreview:\n```json\n' + excerpt + '\n```';
        }
        return successResponse(output);
      }

      return successResponse(
        'Script ran in chrome context and returned:\n```json\n' + json + '\n```'
      );
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
  name: 'privileged',
  description: 'Access privileged ("chrome") contexts and list extensions.',
  privileged: true,
  tools: [
    [listPrivilegedContextsTool, handleListPrivilegedContexts],
    [selectPrivilegedContextTool, handleSelectPrivilegedContext],
    [evaluatePrivilegedScriptTool, handleEvaluatePrivilegedScript],
    [listExtensionsTool, handleListExtensions],
  ],
});
