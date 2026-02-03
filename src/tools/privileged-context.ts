/**
 * Privileged context management tools for MCP
 * Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
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
    'Evaluate JavaScript in the current privileged context. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var. Returns the result of the expression. IMPORTANT: Only provide expressions, not statements. Do not use const, let, or var declarations as they will cause syntax errors. For complex logic, wrap in an IIFE: (function() { const x = 1; return x; })()',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'JavaScript expression to evaluate in the privileged context',
      },
    },
    required: ['expression'],
  },
};

/**
 * Detects if the input looks like a JavaScript statement rather than an expression.
 * Statements like const/let/var declarations cannot be used with return().
 */
export function isLikelyStatement(input: string): boolean {
  const trimmed = input.trim();
  return /^(const|let|var)\s/.test(trimmed);
}

function formatContextList(contexts: any[]): string {
  if (contexts.length === 0) {
    return '🔧 No privileged contexts found';
  }

  const lines: string[] = [`🔧 ${contexts.length} privileged contexts`];
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
    } catch (contextError) {
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
      `✅ Switched to privileged context: ${contextId} (Marionette context set to privileged)`
    );
  } catch (error) {
    return errorResponse(error as Error);
  }
}

export async function handleEvaluatePrivilegedScript(args: unknown): Promise<McpToolResponse> {
  try {
    const { expression } = args as { expression: string };

    if (!expression || typeof expression !== 'string') {
      throw new Error('expression parameter is required and must be a string');
    }

    if (isLikelyStatement(expression)) {
      return errorResponse(
        new Error(
          `Cannot evaluate statement: "${expression.substring(0, 50)}${expression.length > 50 ? '...' : ''}". ` +
            'This tool expects an expression, not a statement (const/let/var declarations are statements). ' +
            'To use statements, wrap them in an IIFE: (function() { const x = 1; return x; })()'
        )
      );
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const driver = firefox.getDriver();

    try {
      const result = await driver.executeScript(`return (${expression});`);
      const resultText =
        typeof result === 'string'
          ? result
          : result === null
            ? 'null'
            : result === undefined
              ? 'undefined'
              : JSON.stringify(result, null, 2);

      return successResponse(`🔧 Result:\n${resultText}`);
    } catch (executeError) {
      return errorResponse(
        new Error(
          `Script execution failed: ${executeError instanceof Error ? executeError.message : String(executeError)}`
        )
      );
    }
  } catch (error) {
    return errorResponse(error as Error);
  }
}
