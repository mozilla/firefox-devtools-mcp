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
import { parseArguments, parsePrefs } from './cli.js';
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
let nextLaunchOptions: FirefoxLaunchOptions | null = null;

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

/**
 * Set options for the next Firefox launch
 * Used by restart_firefox tool to change configuration
 */
export function setNextLaunchOptions(options: FirefoxLaunchOptions): void {
  nextLaunchOptions = options;
  log('Next launch options updated');
}

/**
 * Check if Firefox is currently running (without auto-starting)
 */
export function isFirefoxRunning(): boolean {
  return firefox !== null;
}

/**
 * Get Firefox instance if running, null otherwise (no auto-start)
 */
export function getFirefoxIfRunning(): FirefoxDevTools | null {
  return firefox;
}

export async function getFirefox(): Promise<FirefoxDevTools> {
  // If we have an existing instance, verify it's still connected
  if (firefox) {
    const isConnected = await firefox.isConnected();
    if (!isConnected) {
      log('Firefox connection lost, reconnecting...');
      resetFirefox();
    } else {
      return firefox;
    }
  }

  // No existing instance - create new connection
  log('Initializing Firefox DevTools connection...');

  let options: FirefoxLaunchOptions;

  // Use nextLaunchOptions if set (from restart_firefox tool)
  if (nextLaunchOptions) {
    options = nextLaunchOptions;
    nextLaunchOptions = null; // Clear after use
    log('Using custom launch options from restart_firefox');
  } else {
    // Parse environment variables from CLI args (format: KEY=VALUE)
    let envVars: Record<string, string> | undefined;
    if (args.env && Array.isArray(args.env) && args.env.length > 0) {
      envVars = {};
      for (const envStr of args.env as string[]) {
        const [key, ...valueParts] = envStr.split('=');
        if (key && valueParts.length > 0) {
          envVars[key] = valueParts.join('=');
        }
      }
    }

    // Parse preferences from CLI args
    const prefValues = parsePrefs(args.pref);
    const prefs = Object.keys(prefValues).length > 0 ? prefValues : undefined;

    options = {
      firefoxPath: args.firefoxPath ?? undefined,
      headless: args.headless,
      profilePath: args.profilePath ?? undefined,
      viewport: args.viewport ?? undefined,
      args: (args.firefoxArg as string[] | undefined) ?? undefined,
      startUrl: args.startUrl ?? undefined,
      acceptInsecureCerts: args.acceptInsecureCerts,
      connectExisting: args.connectExisting,
      marionettePort: args.marionettePort,
      marionetteHost: args.marionetteHost,
      env: envVars,
      logFile: args.outputFile ?? undefined,
      prefs,
    };
  }

  firefox = new FirefoxDevTools(options);
  try {
    await firefox.connect();
    log('Firefox DevTools connection established');
    return firefox;
  } catch (error) {
    // Connection failed, clean up the failed instance
    firefox = null;
    throw error;
  }
}

// Tool handler mapping
const toolHandlers = new Map<string, (input: unknown) => Promise<McpToolResponse>>([
  // Pages
  ['list_pages', tools.handleListPages],
  ['new_page', tools.handleNewPage],
  ['navigate_page', tools.handleNavigatePage],
  ['select_page', tools.handleSelectPage],
  ['close_page', tools.handleClosePage],

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

  // Firefox Management
  ['get_firefox_output', tools.handleGetFirefoxLogs],
  ['get_firefox_info', tools.handleGetFirefoxInfo],
  ['restart_firefox', tools.handleRestartFirefox],

  // WebExtensions (install/uninstall use standard BiDi, no privileged context required)
  ['install_extension', tools.handleInstallExtension],
  ['uninstall_extension', tools.handleUninstallExtension],

  // Script evaluation — requires --enable-script
  ...(args.enableScript ? ([['evaluate_script', tools.handleEvaluateScript]] as const) : []),

  // Privileged context tools — requires --enable-privileged-context
  ...(args.enablePrivilegedContext
    ? ([
        ['list_privileged_contexts', tools.handleListPrivilegedContexts],
        ['select_privileged_context', tools.handleSelectPrivilegedContext],
        ['evaluate_privileged_script', tools.handleEvaluatePrivilegedScript],
        ['set_firefox_prefs', tools.handleSetFirefoxPrefs],
        ['get_firefox_prefs', tools.handleGetFirefoxPrefs],
        ['list_extensions', tools.handleListExtensions],
      ] as const)
    : []),
]);

// All tool definitions
const allTools = [
  // Pages
  tools.listPagesTool,
  tools.newPageTool,
  tools.navigatePageTool,
  tools.selectPageTool,
  tools.closePageTool,

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

  // Firefox Management
  tools.getFirefoxLogsTool,
  tools.getFirefoxInfoTool,
  tools.restartFirefoxTool,

  // WebExtensions (install/uninstall use standard BiDi, no privileged context required)
  tools.installExtensionTool,
  tools.uninstallExtensionTool,

  // Script evaluation — requires --enable-script
  ...(args.enableScript ? [tools.evaluateScriptTool] : []),

  // Privileged context tools — requires --enable-privileged-context
  ...(args.enablePrivilegedContext
    ? [
        tools.listPrivilegedContextsTool,
        tools.selectPrivilegedContextTool,
        tools.evaluatePrivilegedScriptTool,
        tools.setFirefoxPrefsTool,
        tools.getFirefoxPrefsTool,
        tools.listExtensionsTool,
      ]
    : []),
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

  // Clean up the Marionette session so Firefox accepts new connections.
  // Without this, the session stays locked after the MCP client disconnects.
  const cleanup = async () => {
    if (firefox) {
      try {
        await firefox.close();
      } catch {
        // ignore
      }
    }
    await server.close();
    process.exit(0);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  // StdioServerTransport does not fire onclose on stdin EOF.
  process.stdin.on('end', cleanup);
  process.stdin.on('close', cleanup);
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
