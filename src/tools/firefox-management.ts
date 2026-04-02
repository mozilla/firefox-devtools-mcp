/**
 * Firefox Management Tools
 * Tools for managing Firefox instance, logs, and configuration
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import {
  args,
  getFirefox,
  getFirefoxIfRunning,
  resetFirefox,
  setNextLaunchOptions,
} from '../index.js';
import { errorResponse, successResponse } from '../utils/response-helpers.js';

// ============================================================================
// Tool: get_firefox_logs
// ============================================================================

export const getFirefoxLogsTool = {
  name: 'get_firefox_output',
  description:
    'Retrieve Firefox output (stdout/stderr including MOZ_LOG, warnings, crashes, stack traces). Returns recent output from the capture file. Use filters to focus on specific content.',
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
};

export async function handleGetFirefoxLogs(input: unknown) {
  try {
    const {
      lines = 100,
      grep,
      since,
    } = input as {
      lines?: number;
      grep?: string;
      since?: number;
    };

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
      `📋 Firefox Output File: ${logFilePath}`,
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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: get_firefox_info
// ============================================================================

export const getFirefoxInfoTool = {
  name: 'get_firefox_info',
  description:
    'Get information about the current Firefox instance configuration, including binary path, environment variables, and output file location.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleGetFirefoxInfo(_input: unknown) {
  try {
    const firefox = await getFirefox();
    const options = firefox.getOptions();
    const logFilePath = firefox.getLogFilePath();

    const info = [];
    info.push('🦊 Firefox Instance Configuration');
    info.push('');

    info.push(`Binary: ${options.firefoxPath ?? 'System Firefox (default)'}`);
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
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: restart_firefox
// ============================================================================

export const restartFirefoxTool = {
  name: 'restart_firefox',
  description:
    'Restart Firefox with different configuration. Allows changing binary path, environment variables, and other options. All current tabs will be closed.',
  inputSchema: {
    type: 'object',
    properties: {
      firefoxPath: {
        type: 'string',
        description: 'New Firefox binary path (optional, keeps current if not specified)',
      },
      profilePath: {
        type: 'string',
        description: 'Firefox profile path (optional, keeps current if not specified)',
      },
      env: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'New environment variables in KEY=VALUE format (optional, e.g., ["MOZ_LOG=HTMLMediaElement:5", "MOZ_LOG_FILE=/tmp/ff.log"])',
      },
      headless: {
        type: 'boolean',
        description: 'Run in headless mode (optional, keeps current if not specified)',
      },
      startUrl: {
        type: 'string',
        description:
          'URL to navigate to after restart (optional, uses about:home if not specified)',
      },
      prefs: {
        type: 'object',
        description:
          'Firefox preferences to set at startup. Values are auto-typed: true/false become booleans, integers become numbers, everything else is a string. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.',
        additionalProperties: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        },
      },
    },
  },
};

export async function handleRestartFirefox(input: unknown) {
  try {
    const { firefoxPath, profilePath, env, headless, startUrl, prefs } = input as {
      firefoxPath?: string;
      profilePath?: string;
      env?: string[];
      headless?: boolean;
      startUrl?: string;
      prefs?: Record<string, string | number | boolean>;
    };

    // This tool is designed to be robust and never get stuck:
    // - Handles disconnected Firefox gracefully (resets stale reference)
    // - Handles close() errors (we're restarting anyway)
    // - Works both as initial start and restart
    // - Always leaves system in a clean state for next tool call

    // Parse new environment variables
    let newEnv: Record<string, string> | undefined;
    if (env && Array.isArray(env) && env.length > 0) {
      newEnv = {};
      for (const envStr of env) {
        const [key, ...valueParts] = envStr.split('=');
        if (key && valueParts.length > 0) {
          newEnv[key] = valueParts.join('=');
        }
      }
    }

    // Check if Firefox is currently running and connected
    const currentFirefox = getFirefoxIfRunning();
    const isConnected = currentFirefox ? await currentFirefox.isConnected() : false;

    if (currentFirefox && isConnected) {
      // Firefox is running - restart with new config
      const currentOptions = currentFirefox.getOptions();

      // Merge prefs: combine existing with new, new takes precedence
      const mergedPrefs =
        prefs !== undefined ? { ...(currentOptions.prefs || {}), ...prefs } : currentOptions.prefs;

      // Merge with current options, preferring new values
      const newOptions = {
        ...currentOptions,
        firefoxPath: firefoxPath ?? currentOptions.firefoxPath,
        profilePath: profilePath ?? currentOptions.profilePath,
        env: newEnv !== undefined ? newEnv : currentOptions.env,
        headless: headless !== undefined ? headless : currentOptions.headless,
        startUrl: startUrl ?? currentOptions.startUrl ?? 'about:home',
        prefs: mergedPrefs,
      };

      // Set options for next launch
      setNextLaunchOptions(newOptions);

      // Close current instance (ignore errors - we're restarting anyway)
      try {
        await currentFirefox.close();
      } catch {
        // Ignore close errors - we'll reset anyway
      }
      resetFirefox();

      // Prepare change summary
      const changes = [];
      if (firefoxPath && firefoxPath !== currentOptions.firefoxPath) {
        changes.push(`Binary: ${firefoxPath}`);
      }
      if (profilePath && profilePath !== currentOptions.profilePath) {
        changes.push(`Profile: ${profilePath}`);
      }
      if (newEnv !== undefined && JSON.stringify(newEnv) !== JSON.stringify(currentOptions.env)) {
        changes.push(`Environment variables updated:`);
        for (const [key, value] of Object.entries(newEnv)) {
          changes.push(`  ${key}=${value}`);
        }
      }
      if (headless !== undefined && headless !== currentOptions.headless) {
        changes.push(`Headless: ${headless ? 'enabled' : 'disabled'}`);
      }
      if (startUrl && startUrl !== currentOptions.startUrl) {
        changes.push(`Start URL: ${startUrl}`);
      }

      if (changes.length === 0) {
        return successResponse(
          '✅ Firefox closed. Will restart with same configuration on next tool call.'
        );
      }

      return successResponse(
        `✅ Firefox closed. Will restart with new configuration on next tool call:\n${changes.join('\n')}`
      );
    } else {
      // Firefox not running (or disconnected) - configure for first start
      if (currentFirefox) {
        // Had a stale disconnected reference, clean it up
        resetFirefox();
      }

      // Use provided firefoxPath, or fall back to CLI args if available
      const resolvedFirefoxPath = firefoxPath ?? args.firefoxPath ?? undefined;

      if (!resolvedFirefoxPath) {
        return errorResponse(
          new Error(
            'Firefox is not running and no firefoxPath provided. Please specify firefoxPath to start Firefox.'
          )
        );
      }

      const newOptions = {
        firefoxPath: resolvedFirefoxPath,
        profilePath: profilePath ?? args.profilePath ?? undefined,
        env: newEnv,
        headless: headless ?? false,
        startUrl: startUrl ?? 'about:home',
      };

      setNextLaunchOptions(newOptions);

      const config = [`Binary: ${resolvedFirefoxPath}`];
      const resolvedProfilePath = profilePath ?? args.profilePath;
      if (resolvedProfilePath) {
        config.push(`Profile: ${resolvedProfilePath}`);
      }
      if (newEnv) {
        config.push('Environment variables:');
        for (const [key, value] of Object.entries(newEnv)) {
          config.push(`  ${key}=${value}`);
        }
      }
      if (headless) {
        config.push('Headless: enabled');
      }
      if (startUrl) {
        config.push(`Start URL: ${startUrl}`);
      }

      return successResponse(
        `✅ Firefox configured. Will start on next tool call:\n${config.join('\n')}`
      );
    }
  } catch (error) {
    return errorResponse(error as Error);
  }
}
