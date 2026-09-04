import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { compareVersions } from '../utils/version.js';
import { remoteValueToNative } from '../utils/remote-value.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

const MIN_VERSION = '153';

function requireDebuggingSupport(firefox: { getFirefoxVersion(): string | null }): void {
  const version = firefox.getFirefoxVersion();
  if (version !== null && compareVersions(version, MIN_VERSION) < 0) {
    throw new Error(
      `moz:debugging requires Firefox ${MIN_VERSION}+, current version is ${version}`
    );
  }
}

function requireContext(contextId: string | null): string {
  if (!contextId) {
    throw new Error('No active browsing context');
  }
  return contextId;
}

// ============================================================================
// Tool definitions
// ============================================================================

export const enableDebuggerTool = {
  name: 'enable_debugger',
  description:
    'Enable the JS debugger for the current page. Required before set_logpoint works. Requires Firefox 153+.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: { type: 'object', properties: {} },
} satisfies ToolDefinition;

export const listScriptsTool = {
  name: 'list_scripts',
  description:
    'List all JavaScript files currently loaded in the page. Requires enable_debugger to have been called.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: { type: 'object', properties: {} },
} satisfies ToolDefinition;

export const getScriptSourceTool = {
  name: 'get_script_source',
  description:
    'Get the source code of a JavaScript file loaded in the page. Requires enable_debugger to have been called.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      scriptUrl: { type: 'string', description: 'URL of the script to retrieve.' },
    },
    required: ['scriptUrl'],
  },
} satisfies ToolDefinition;

export const setLogpointTool = {
  name: 'set_logpoint',
  description:
    'Set a logpoint at a specific location. When execution reaches that line, the expression is evaluated and the result is stored without pausing. Use get_logpoint_results to retrieve collected values. Requires enable_debugger to have been called.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of the script.' },
      line: { type: 'number', description: 'Line number (1-based).' },
      expression: {
        type: 'string',
        description: 'JavaScript expression to evaluate each time the logpoint is hit.',
      },
    },
    required: ['url', 'line', 'expression'],
  },
} satisfies ToolDefinition;

export const removeLogpointTool = {
  name: 'remove_logpoint',
  description: 'Remove a previously set logpoint.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      logpoint: { type: 'string', description: 'Logpoint id returned by set_logpoint.' },
    },
    required: ['logpoint'],
  },
} satisfies ToolDefinition;

export const getLogpointResultsTool = {
  name: 'get_logpoint_results',
  description: 'Get the results collected by a logpoint since it was set.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      logpoint: { type: 'string', description: 'Logpoint id returned by set_logpoint.' },
    },
    required: ['logpoint'],
  },
} satisfies ToolDefinition;

// ============================================================================
// Handlers
// ============================================================================

export const handleEnableDebugger = defineToolHandler(
  async (_args: unknown): Promise<McpToolResponse> => {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    await firefox.sendBiDiCommand('moz:debugging.setDebuggerEnabled', { enabled: true });
    return successResponse('Debugger enabled');
  }
);

export const handleListScripts = defineToolHandler(
  async (_args: unknown): Promise<McpToolResponse> => {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    const contextId = requireContext(firefox.getCurrentContextId());
    const result = await firefox.sendBiDiCommand('moz:debugging.listScripts', {
      context: contextId,
    });
    const scripts = result.scripts;
    if (scripts.length === 0) {
      return successResponse('No scripts found');
    }
    return successResponse(scripts.join('\n'));
  }
);

export const handleGetScriptSource = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { scriptUrl } = args as { scriptUrl: string };
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    const contextId = requireContext(firefox.getCurrentContextId());
    const result = await firefox.sendBiDiCommand('moz:debugging.getScriptSource', {
      context: contextId,
      scriptUrl,
    });
    return successResponse(result.source);
  }
);

export const handleSetLogpoint = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { url, line, expression } = args as { url: string; line: number; expression: string };
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    const logpointId = await firefox.setLogpoint(url, line, expression);
    return successResponse(`Logpoint set (id: ${logpointId})`);
  }
);

export const handleRemoveLogpoint = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { logpoint } = args as { logpoint: string };
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    await firefox.removeLogpoint(logpoint);
    return successResponse('Logpoint removed');
  }
);

export const handleGetLogpointResults = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { logpoint } = args as { logpoint: string };
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    requireDebuggingSupport(firefox);
    const results = firefox.getLogpointResults(logpoint);
    if (results === null) {
      return errorResponse(new Error(`Logpoint ${logpoint} not found`));
    }
    if (results.length === 0) {
      return successResponse('No results collected yet');
    }
    const lines = results.map((r, i) => {
      if (r.error) {
        return `[${i + 1}] Error: ${r.error}`;
      }
      return `[${i + 1}] ${JSON.stringify(remoteValueToNative(r.value))}`;
    });
    return successResponse(lines.join('\n'));
  }
);

export const module = defineModule({
  name: 'debugging',
  description: 'Inspect scripts and set logpoints (Firefox 153+).',
  tools: [
    [enableDebuggerTool, handleEnableDebugger],
    [listScriptsTool, handleListScripts],
    [getScriptSourceTool, handleGetScriptSource],
    [setLogpointTool, handleSetLogpoint],
    [removeLogpointTool, handleRemoveLogpoint],
    [getLogpointResultsTool, handleGetLogpointResults],
  ],
});
