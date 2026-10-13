import { successResponse, previewExcerpt } from '../utils/response-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

const SESSION_ENDING_METHODS = new Set(['session.end', 'session.new', 'browser.close']);

export const sendBidiCommandTool = {
  name: 'send_bidi_command',
  description:
    'Send a raw WebDriver BiDi command and return its result. Escape hatch for BiDi features no other tool covers; prefer a dedicated tool when one exists.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        description: 'BiDi command name, e.g. browsingContext.getTree',
      },
      params: {
        type: 'object',
        description: 'Command parameters (default: {})',
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
    required: ['method'],
  },
} satisfies ToolDefinition;

export const handleSendBidiCommand = defineToolHandler(async function handleSendBidiCommand(
  args: unknown
): Promise<McpToolResponse> {
  const { method, params, saveTo, preview } = args as {
    method: string;
    params?: Record<string, unknown>;
    saveTo?: boolean | string;
    preview?: number;
  };

  if (!method || typeof method !== 'string') {
    throw new Error('method required');
  }
  if (SESSION_ENDING_METHODS.has(method)) {
    throw new Error(
      `${method} would end the session this server depends on. Use close_firefox_session instead.`
    );
  }

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const send = firefox.sendBiDiCommand as (
    method: string,
    params: Record<string, unknown>
  ) => Promise<unknown>;
  const result = await send(method, params ?? {});
  const json = JSON.stringify(result, null, 2) ?? 'null';

  if (saveTo) {
    const saved = await saveOutput(json, saveTo === true ? undefined : saveTo, 'bidi-command');
    let output = `Result saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
    const excerpt = previewExcerpt(json, preview);
    if (excerpt) {
      output += '\nPreview:\n```json\n' + excerpt + '\n```';
    }
    return successResponse(output);
  }

  return successResponse('```json\n' + json + '\n```');
});

export const module = defineModule({
  name: 'bidi',
  description: 'Send raw WebDriver BiDi commands.',
  mozOnly: true,
  tools: [[sendBidiCommandTool, handleSendBidiCommand]],
});
