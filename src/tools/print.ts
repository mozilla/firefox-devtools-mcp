import { successResponse } from '../utils/response-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

export const printPageTool = {
  name: 'print_page',
  description: 'Print the current page to a PDF file using print CSS. Returns the saved file path.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      landscape: {
        type: 'boolean',
        description: 'Use landscape orientation (default: false)',
      },
      background: {
        type: 'boolean',
        description: 'Print background colors and images (default: false)',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Where to save the PDF. Pass a file path, an existing directory (generated file inside), or true or omit it (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
    },
  },
} satisfies ToolDefinition;

export const handlePrintPage = defineToolHandler(async function handlePrintPage(
  args: unknown
): Promise<McpToolResponse> {
  const { landscape, background, saveTo } = (args ?? {}) as {
    landscape?: boolean;
    background?: boolean;
    saveTo?: boolean | string;
  };

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const base64Pdf = await firefox.printPage({
    landscape: landscape === true,
    background: background === true,
  });

  if (!base64Pdf || typeof base64Pdf !== 'string') {
    throw new Error('Invalid PDF data');
  }

  const saved = await saveOutput(
    Buffer.from(base64Pdf, 'base64'),
    typeof saveTo === 'string' ? saveTo : undefined,
    'page',
    'pdf'
  );

  return successResponse(`PDF saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`);
});

export const module = defineModule({
  name: 'print',
  description: 'Print the page to PDF.',
  unavailableInRestrictedSession: true,
  tools: [[printPageTool, handlePrintPage]],
});
