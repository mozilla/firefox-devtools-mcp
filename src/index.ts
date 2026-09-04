import { version } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from './config/constants.js';
import { log, logError, logDebug, setupLogFile, flushLogs } from './utils/logger.js';
import { parsePrefs, defaultProfileDir } from './cli.js';
import type { parseArguments } from './cli.js';
import { FirefoxDevTools } from './firefox/index.js';
import type { FirefoxLaunchOptions } from './firefox/types.js';
import { buildToolset } from './tools/registry.js';
import { errorResponse } from './utils/response-helpers.js';
import { applySystemAccessPolicy, clearSystemAccessEnvironment } from './system-access.js';

type Args = ReturnType<typeof parseArguments>;

// Validate Node.js version
const [major] = version.substring(1).split('.').map(Number);
if (!major || major < 20) {
  console.error(`Node ${version} is not supported. Please use Node.js >=20.`);
  process.exit(1);
}

// Set by run() before the server starts; initialized to satisfy the type checker.
export let args = {} as Readonly<Args>;

// Global context (lazy initialized on first tool call)
let firefox: FirefoxDevTools | null = null;
let nextLaunchOptions: FirefoxLaunchOptions | null = null;
// Warning generated during Firefox startup, surfaced in the first tool response.
let pendingWarning: string | null = null;

/**
 * Reset Firefox instance (used when disconnection is detected).
 * Tries graceful close with a timeout; if it hangs (zombie geckodriver),
 * force-kills the process tree.
 */
export async function resetFirefox(): Promise<void> {
  if (firefox) {
    await firefox.close();
    firefox = null;
  }
  pendingWarning = null;
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
    const isConnected = await firefox.ensureConnected();
    if (!isConnected) {
      log('Firefox connection lost, reconnecting...');
      await resetFirefox();
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
      profilePath:
        args.profilePath ?? (args.autoProfile ? defaultProfileDir(args.firefoxPath) : undefined),
      viewport: args.viewport ?? undefined,
      args: (args.firefoxArg as string[] | undefined) ?? undefined,
      startUrl: args.startUrl ?? undefined,
      acceptInsecureCerts: args.acceptInsecureCerts,
      connectExisting: args.connectExisting,
      marionettePort: args.marionettePort,
      lookupMarionettePort: args.lookupMarionettePort,
      env: envVars,
      logFile: args.outputFile ?? undefined,
      prefs,
      androidDevice: args.androidDevice ?? undefined,
      androidPackage: args.androidPackage ?? undefined,
      androidWipeAppData: args.androidWipeAppData,
      captureNetworkBodies: !args.disableNetworkBodyCollection,
    };
  }

  options = applySystemAccessPolicy(options, args.allowSystemAccess === true);
  firefox = new FirefoxDevTools(options);
  try {
    await firefox.connect();
    log('Firefox DevTools connection established');
    pendingWarning = firefox.getAndClearProfileWarning();
    return firefox;
  } catch (error) {
    // Clean up before discarding — ensures the geckodriver process is killed
    // and the Marionette session is released. Without this, a failure during
    // BiDi setup (after the WebDriver session is already established) would
    // leave geckodriver running with an active Marionette session, causing
    // "Connection attempt denied because an active session has been found"
    // on the next connect attempt.
    await firefox.close();
    firefox = null;
    throw error;
  }
}

export async function run(
  parseArgsFn: (version: string) => Args,
  importMetaUrl: string
): Promise<void> {
  // Only run if this entry file is executed directly (not imported as a library).
  // We need to normalize both paths to handle different execution contexts (npx, node, etc.)
  const modulePath = fileURLToPath(importMetaUrl);
  const scriptPath = process.argv[1] ? resolve(process.argv[1]) : '';
  let isMainModule = false;
  try {
    const realModulePath = realpathSync(modulePath);
    const realScriptPath = scriptPath ? realpathSync(scriptPath) : '';
    isMainModule = realModulePath === realScriptPath;
  } catch {
    isMainModule = modulePath === scriptPath;
  }
  if (!isMainModule) {
    return;
  }

  args = Object.freeze(parseArgsFn(SERVER_VERSION));
  const allowSystemAccess = args.allowSystemAccess === true;
  clearSystemAccessEnvironment(process.env);

  if (args.logFile) {
    setupLogFile(args.logFile);
  }

  // Resolve which tool modules to expose from --tools / --tool-preset (applying
  // deprecated flags and the privileged capability gate) and build their tools.
  const {
    moduleNames,
    warnings,
    toolDefinitions: allTools,
    handlers: toolHandlers,
    instructions,
  } = buildToolset({
    tools: args.tools,
    preset: args.toolPreset,
    enableScript: Boolean(args.enableScript),
    enablePrivilegedContext: Boolean(args.enablePrivilegedContext),
    allowPrivileged: allowSystemAccess,
  });
  for (const warning of warnings) {
    log(warning);
  }
  log(`Enabled tool modules: ${moduleNames.join(', ')}`);

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
        tools: {},
      },
      instructions,
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
      const result = await handler(args);
      if (pendingWarning) {
        // Return as isError so that agents acting as MCP clients (e.g. Claude)
        // surface the message to the user.
        // Also note the operation completed so the agent does not retry.
        const operationNote =
          result.content[0]?.type === 'text'
            ? `\n\n[Note: The operation also completed — ${result.content[0].text}]`
            : '';
        const warning = pendingWarning;
        pendingWarning = null;
        return errorResponse(`${warning}${operationNote}`);
      }
      return result;
    } catch (error) {
      logError(`Error executing tool ${name}`, error);
      throw error;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Firefox DevTools MCP server running on stdio');
  log('Ready to accept tool requests');

  // Clean up the Marionette session so Firefox accepts new connections.
  // Without this, the session stays locked after the MCP client disconnects.
  const cleanup = async () => {
    await resetFirefox();
    await server.close();
    await flushLogs().catch(() => {});
    process.exit(0);
  };
  const onSignal = () => void cleanup();
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  // StdioServerTransport does not fire onclose on stdin EOF.
  process.stdin.on('end', onSignal);
  process.stdin.on('close', onSignal);
}
