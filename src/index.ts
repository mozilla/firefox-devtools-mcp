#!/usr/bin/env node

/**
 * Firefox DevTools MCP Server
 * Model Context Protocol server for Firefox browser automation via WebDriver BiDi
 */

// Load .env file in development mode
if (process.env.NODE_ENV !== 'production') {
  try {
    const { config } = await import('dotenv');
    const result = config();
    if (result.parsed) {
      console.error('📋 Loaded .env file for development');
    }
  } catch (error) {
    // dotenv not required in production
  }
}

import { version } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from './config/constants.js';
import { log, logError, logDebug } from './utils/logger.js';
import { parseArguments } from './cli.js';
import { FirefoxDevTools } from './firefox/index.js';
import type { FirefoxLaunchOptions } from './firefox/types.js';
import * as tools from './tools/index.js';
import type { McpToolResponse } from './types/common.js';
import { FirefoxDisconnectedError } from './utils/errors.js';

// Export for direct usage in scripts
export { FirefoxDevTools } from './firefox/index.js';
export { FirefoxDisconnectedError, isDisconnectionError } from './utils/errors.js';

// Validate Node.js version
const [major] = version.substring(1).split('.').map(Number);
if (!major || major < 20) {
  console.error(`Node ${version} is not supported. Please use Node.js >=20.`);
  process.exit(1);
}

// Parse CLI arguments
export const args = parseArguments(SERVER_VERSION);

// Global context (lazy initialized on first tool call)
let firefox: FirefoxDevTools | null = null;

/**
 * Reset Firefox instance (used when disconnection is detected)
 */
export function resetFirefox(): void {
  if (firefox) {
    firefox.reset();
    firefox = null;
  }
  log('Firefox instance reset - will reconnect on next tool call');
}

export async function getFirefox(): Promise<FirefoxDevTools> {
  // If we have an existing instance, verify it's still connected
  if (firefox) {
    const isConnected = await firefox.isConnected();
    if (!isConnected) {
      log('Firefox connection lost - browser was closed or disconnected');
      resetFirefox();
      throw new FirefoxDisconnectedError('Browser was closed');
    }
    return firefox;
  }

  // No existing instance - create new connection
  log('Initializing Firefox DevTools connection...');

  const options: FirefoxLaunchOptions = {
    firefoxPath: args.firefoxPath ?? undefined,
    headless: args.headless,
    profilePath: args.profilePath ?? undefined,
    viewport: args.viewport ?? undefined,
    args: (args.firefoxArg as string[] | undefined) ?? undefined,
    startUrl: args.startUrl ?? undefined,
    acceptInsecureCerts: args.acceptInsecureCerts,
    connectExisting: args.connectExisting,
    marionettePort: args.marionettePort,
  };

  firefox = new FirefoxDevTools(options);
  await firefox.connect();
  log('Firefox DevTools connection established');

  return firefox;
}

// Tool handler mapping
const toolHandlers = new Map<string, (input: unknown) => Promise<McpToolResponse>>([
  // Pages
  ['list_pages', tools.handleListPages],
  ['new_page', tools.handleNewPage],
  ['navigate_page', tools.handleNavigatePage],
  ['select_page', tools.handleSelectPage],
  ['close_page', tools.handleClosePage],

  // Script evaluation - DISABLED (see docs/future-features.md)
  // ['evaluate_script', tools.handleEvaluateScript],

  // Console
  ['list_console_messages', tools.handleListConsoleMessages],
  ['clear_console_messages', tools.handleClearConsoleMessages],

  // Network
  ['list_network_requests', tools.handleListNetworkRequests],
  ['get_network_request', tools.handleGetNetworkRequest],

  // Snapshot
  ['take_snapshot', tools.handleTakeSnapshot],
  ['resolve_uid_to_selector', tools.handleResolveUidToSelector],
  ['clear_snapshot', tools.handleClearSnapshot],

  // Input
  ['click_by_uid', tools.handleClickByUid],
  ['hover_by_uid', tools.handleHoverByUid],
  ['fill_by_uid', tools.handleFillByUid],
  ['drag_by_uid_to_uid', tools.handleDragByUidToUid],
  ['fill_form_by_uid', tools.handleFillFormByUid],
  ['upload_file_by_uid', tools.handleUploadFileByUid],

  // Screenshot
  ['screenshot_page', tools.handleScreenshotPage],
  ['screenshot_by_uid', tools.handleScreenshotByUid],

  // Utilities
  ['accept_dialog', tools.handleAcceptDialog],
  ['dismiss_dialog', tools.handleDismissDialog],
  ['navigate_history', tools.handleNavigateHistory],
  ['set_viewport_size', tools.handleSetViewportSize],
]);

// All tool definitions
const allTools = [
  // Pages
  tools.listPagesTool,
  tools.newPageTool,
  tools.navigatePageTool,
  tools.selectPageTool,
  tools.closePageTool,

  // Script evaluation - DISABLED (see docs/future-features.md)
  // tools.evaluateScriptTool,

  // Console
  tools.listConsoleMessagesTool,
  tools.clearConsoleMessagesTool,

  // Network
  tools.listNetworkRequestsTool,
  tools.getNetworkRequestTool,

  // Snapshot
  tools.takeSnapshotTool,
  tools.resolveUidToSelectorTool,
  tools.clearSnapshotTool,

  // Input
  tools.clickByUidTool,
  tools.hoverByUidTool,
  tools.fillByUidTool,
  tools.dragByUidToUidTool,
  tools.fillFormByUidTool,
  tools.uploadFileByUidTool,

  // Screenshot
  tools.screenshotPageTool,
  tools.screenshotByUidTool,

  // Utilities
  tools.acceptDialogTool,
  tools.dismissDialogTool,
  tools.navigateHistoryTool,
  tools.setViewportSizeTool,
];

async function main() {
  log(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);
  log(`Node.js ${version}`);

  // Log configuration
  logDebug(`Configuration:`);
  logDebug(`  Headless: ${args.headless}`);
  if (args.firefoxPath) {
    logDebug(`  Firefox Path: ${args.firefoxPath}`);
  }
  if (args.viewport) {
    logDebug(`  Viewport: ${args.viewport.width}x${args.viewport.height}`);
  }

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('Listing available tools');
    return {
      tools: allTools,
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    log(`Executing tool: ${name}`);

    const handler = toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      return await handler(args);
    } catch (error) {
      logError(`Error executing tool ${name}`, error);
      throw error;
    }
  });

  // List resources (not implemented for this server)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
  });

  // Read resource (not implemented for this server)
  server.setRequestHandler(ReadResourceRequestSchema, async () => {
    throw new Error('Resource reading not implemented');
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Firefox DevTools MCP server running on stdio');
  log('Ready to accept tool requests');
}

// Only run main() if this file is executed directly (not imported)
// In ES modules, check if import.meta.url matches the executed file
// We need to normalize both paths to handle different execution contexts (npx, node, etc.)
const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1] ? resolve(process.argv[1]) : '';

// Resolve both paths fully to handle symlinks and path normalization
let isMainModule = false;
try {
  const realModulePath = realpathSync(modulePath);
  const realScriptPath = scriptPath ? realpathSync(scriptPath) : '';
  isMainModule = realModulePath === realScriptPath;
} catch (error) {
  // If realpath fails (e.g., file doesn't exist), fall back to simple comparison
  isMainModule = modulePath === scriptPath;
}

if (isMainModule) {
  main().catch((error) => {
    logError('Fatal error in main', error);
    process.exit(1);
  });
}
