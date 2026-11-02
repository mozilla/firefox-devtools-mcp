/**
 * Firefox Launch Tools
 * Tool for restarting Firefox under a different launch configuration.
 *
 * Changing the launch configuration means choosing the binary, profile,
 * environment and preferences Firefox starts with, so this module is only
 * available in the Mozilla-internal build. Public builds expose
 * close_firefox_session instead, which ends the session without reconfiguring
 * the browser.
 */

import { errorResponse, successResponse } from '../utils/response-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';

// ============================================================================
// Tool: restart_firefox
// ============================================================================

export const restartFirefoxTool = {
  name: 'restart_firefox',
  description:
    'Restart Firefox with different configuration. Allows changing binary path, environment variables, and other options. All current tabs will be closed.',
  annotations: {
    readOnlyHint: false,
  },
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
          'URL to navigate to after restart (optional, uses about:blank if not specified)',
      },
      prefs: {
        type: 'object',
        description:
          'Firefox preferences to set at startup. Values are auto-typed: true/false become booleans, integers become numbers, everything else is a string.',
        additionalProperties: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        },
      },
    },
  },
} as const satisfies ToolDefinition;

export const handleRestartFirefox = defineToolHandler<typeof restartFirefoxTool>(async (input) => {
  const { firefoxPath, profilePath, env, headless, startUrl, prefs } = input;

  const { args, getFirefoxIfRunning, resetFirefox, setNextLaunchOptions } = await import(
    '../index.js'
  );

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

  // In connect-existing, the browser cannot be restarted and the new
  // configuration cannot be applied. Reject the tool explicitly. Checking args
  // covers dropped sessions as well.
  if (args.connectExisting || currentFirefox?.getOptions().connectExisting) {
    return errorResponse(
      new Error(
        'restart_firefox cannot be used when the server is connected to an existing Firefox: ' +
          'the browser is not managed by this server. Use close_firefox_session to release the ' +
          'connection, the next browser tool call re-attaches to the same instance.'
      )
    );
  }

  const isConnected = currentFirefox ? await currentFirefox.ensureConnected() : false;

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
      startUrl: startUrl ?? currentOptions.startUrl ?? 'about:blank',
      prefs: mergedPrefs,
    };

    // Set options for next launch
    setNextLaunchOptions(newOptions);

    // Close current instance
    await resetFirefox();

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
        'Firefox closed. Will restart with same configuration on next tool call.'
      );
    }

    return successResponse(
      `Firefox closed. Will restart with new configuration on next tool call:\n${changes.join('\n')}`
    );
  } else {
    // Firefox not running (or disconnected) - configure for first start
    if (currentFirefox) {
      // Had a stale disconnected reference, clean it up
      await resetFirefox();
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
      startUrl: startUrl ?? 'about:blank',
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
      `Firefox configured. Will start on next tool call:\n${config.join('\n')}`
    );
  }
});

export const module = defineModule({
  name: 'launch',
  description: 'Restart Firefox under a different launch configuration.',
  mozOnly: true,
  tools: [[restartFirefoxTool, handleRestartFirefox]],
});
