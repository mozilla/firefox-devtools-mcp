/**
 * Firefox Management Tools
 * Tools for managing Firefox instance, logs, and configuration
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { successResponse } from '../utils/response-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';

// ============================================================================
// Tool: get_firefox_logs
// ============================================================================

export const getFirefoxLogsTool = {
  name: 'get_firefox_output',
  description:
    'Retrieve Firefox output (stdout/stderr including MOZ_LOG, warnings, crashes, stack traces). Returns recent output from the capture file. Use filters to focus on specific content.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      lines: {
        type: 'number',
        description: 'Number of recent log lines to return (default: 100, max: 10000)',
      },
      grep: {
        type: 'string',
        description: 'Filter log lines containing this string (case-insensitive)',
      },
      since: {
        type: 'number',
        description: 'Only show logs written in the last N seconds',
      },
    },
  },
} as const satisfies ToolDefinition;

export const handleGetFirefoxLogs = defineToolHandler<typeof getFirefoxLogsTool>(async (input) => {
  const { lines = 100, grep, since } = input;

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();
  const logFilePath = firefox.getLogFilePath();

  if (!logFilePath) {
    return successResponse(
      'No output capture configured. Use --env to set environment variables or --output-file to enable output capture.'
    );
  }

  if (!existsSync(logFilePath)) {
    return successResponse(`Output file not found: ${logFilePath}`);
  }

  // Check file age if 'since' filter is used
  if (since !== undefined) {
    const stats = statSync(logFilePath);
    const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;
    if (ageSeconds > since) {
      return successResponse(
        `Output file is ${Math.floor(ageSeconds)}s old, but only output from last ${since}s was requested. File may not have recent entries.`
      );
    }
  }

  // Read output file
  const content = readFileSync(logFilePath, 'utf-8');
  let allLines = content.split('\n').filter((line) => line.trim().length > 0);

  // Apply grep filter
  if (grep) {
    const grepLower = grep.toLowerCase();
    allLines = allLines.filter((line) => line.toLowerCase().includes(grepLower));
  }

  // Get last N lines
  const maxLines = Math.min(lines, 10000);
  const recentLines = allLines.slice(-maxLines);

  const result = [
    `Firefox Output File: ${logFilePath}`,
    `Total lines in file: ${allLines.length}`,
    grep ? `Lines matching "${grep}": ${allLines.length}` : '',
    `Showing last ${recentLines.length} lines:`,
    '',
    '─'.repeat(80),
    recentLines.join('\n'),
  ]
    .filter(Boolean)
    .join('\n');

  return successResponse(result);
});

// ============================================================================
// Tool: get_firefox_info
// ============================================================================

export const getFirefoxInfoTool = {
  name: 'get_firefox_info',
  description:
    'Get information about the current Firefox instance configuration, including binary path, environment variables, and output file location.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} as const satisfies ToolDefinition;

export const handleGetFirefoxInfo = defineToolHandler<typeof getFirefoxInfoTool>(async (_input) => {
  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();
  const options = firefox.getOptions();
  const logFilePath = firefox.getLogFilePath();
  const version = firefox.getFirefoxVersion();

  const info = [];
  info.push('Firefox Instance Configuration');
  info.push('');

  const detectedBinary = firefox.getDetectedBinaryPath();
  const binaryLabel =
    options.firefoxPath ??
    (detectedBinary ? `${detectedBinary} (auto-detected)` : 'System Firefox (default)');
  info.push(`Binary: ${binaryLabel}`);
  info.push(`Firefox version: ${version ?? '(unknown)'}`);
  info.push(`Headless: ${options.headless ? 'Yes' : 'No'}`);

  if (options.viewport) {
    info.push(`Viewport: ${options.viewport.width}x${options.viewport.height}`);
  }

  if (options.profilePath) {
    info.push(`Profile: ${options.profilePath}`);
  }

  if (options.startUrl) {
    info.push(`Start URL: ${options.startUrl}`);
  }

  if (options.args && options.args.length > 0) {
    info.push(`Arguments: ${options.args.join(' ')}`);
  }

  if (options.env && Object.keys(options.env).length > 0) {
    info.push('');
    info.push('Environment Variables:');
    for (const [key, value] of Object.entries(options.env)) {
      info.push(`  ${key}=${value}`);
    }
  }

  if (options.prefs && Object.keys(options.prefs).length > 0) {
    info.push('');
    info.push('Preferences:');
    for (const [key, value] of Object.entries(options.prefs)) {
      info.push(`  ${key} = ${JSON.stringify(value)}`);
    }
  }

  if (logFilePath) {
    info.push('');
    info.push(`Output File: ${logFilePath}`);
    if (existsSync(logFilePath)) {
      const stats = statSync(logFilePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      info.push(`  Size: ${sizeMB} MB`);
      info.push(`  Last Modified: ${stats.mtime.toISOString()}`);
    } else {
      info.push('  (file not created yet)');
    }
  }

  return successResponse(info.join('\n'));
});

// ============================================================================
// Tool: close_firefox_session
// ============================================================================

export const closeFirefoxSessionTool = {
  name: 'close_firefox_session',
  description:
    'Ends the browser session. If the server connected to your existing Firefox, ' +
    'this releases the connection and leaves Firefox running. If the server started Firefox itself, this closes it. ' +
    'Call this when the browser task is complete and no further browser interaction is expected.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
} as const satisfies ToolDefinition;

export const handleCloseFirefoxSession = defineToolHandler<typeof closeFirefoxSessionTool>(
  async (_args) => {
    const { getFirefoxIfRunning, resetFirefox } = await import('../index.js');

    const currentFirefox = getFirefoxIfRunning();
    if (!currentFirefox) {
      return successResponse('No Firefox session is currently active.');
    }

    // Read options before calling resetFirefox().
    const { connectExisting } = currentFirefox.getOptions();
    await resetFirefox();

    return successResponse(
      connectExisting
        ? 'Disconnected from Firefox. The browser is still running.'
        : 'Closed the Firefox instance started by this server, a new session will start if you use browser tools again.'
    );
  }
);

export const module = defineModule({
  name: 'management',
  description: 'Inspect Firefox options and logs, and close the browser.',
  tools: [
    [getFirefoxLogsTool, handleGetFirefoxLogs],
    [getFirefoxInfoTool, handleGetFirefoxInfo],
    [closeFirefoxSessionTool, handleCloseFirefoxSession],
  ],
});
