/**
 * Firefox Preferences Tools
 * Tools for getting and setting Firefox preferences via Services.prefs API
 * Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { generatePrefScript } from '../firefox/pref-utils.js';
import type { McpToolResponse } from '../types/common.js';

// ============================================================================
// Tool: set_firefox_prefs
// ============================================================================

export const setFirefoxPrefsTool = {
  name: 'set_firefox_prefs',
  description:
    'Set Firefox preferences at runtime a privileged API. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var.',
  inputSchema: {
    type: 'object',
    properties: {
      prefs: {
        type: 'object',
        description:
          'Object mapping preference names to values. Values are auto-typed: true/false become booleans, integers become numbers, everything else is a string.',
        additionalProperties: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        },
      },
    },
    required: ['prefs'],
  },
};

export async function handleSetFirefoxPrefs(args: unknown): Promise<McpToolResponse> {
  try {
    const { prefs } = args as { prefs: Record<string, string | number | boolean> };

    if (!prefs || typeof prefs !== 'object') {
      throw new Error('prefs parameter is required and must be an object');
    }

    const prefEntries = Object.entries(prefs);
    if (prefEntries.length === 0) {
      return successResponse('No preferences to set');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    // Get privileged ("chrome") contexts
    const result = await firefox.sendBiDiCommand('browsingContext.getTree', {
      'moz:scope': 'chrome',
    });

    const contexts = result.contexts || [];
    if (contexts.length === 0) {
      throw new Error(
        'No privileged contexts available. Ensure MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 is set.'
      );
    }

    const driver = firefox.getDriver();
    const chromeContextId = contexts[0].context;

    // Remember current context
    const originalContextId = firefox.getCurrentContextId();

    try {
      // Switch to chrome context
      await driver.switchTo().window(chromeContextId);
      await driver.setContext('chrome');

      const results: string[] = [];
      const errors: string[] = [];

      // Set each preference
      for (const [name, value] of prefEntries) {
        try {
          const script = generatePrefScript(name, value);
          await driver.executeScript(script);
          results.push(`  ${name} = ${JSON.stringify(value)}`);
        } catch (error) {
          errors.push(`  ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const output: string[] = [];
      if (results.length > 0) {
        output.push(`✅ Set ${results.length} preference(s):`);
        output.push(...results);
      }
      if (errors.length > 0) {
        output.push(`\n⚠️ Failed to set ${errors.length} preference(s):`);
        output.push(...errors);
      }

      return successResponse(output.join('\n'));
    } finally {
      // Restore content context
      try {
        await driver.setContext('content');
        if (originalContextId) {
          await driver.switchTo().window(originalContextId);
        }
      } catch {
        // Ignore errors restoring context
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('UnsupportedOperationError')) {
      return errorResponse(
        new Error(
          'Chrome context access not enabled. Set MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 environment variable and restart Firefox.'
        )
      );
    }
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: get_firefox_prefs
// ============================================================================

export const getFirefoxPrefsTool = {
  name: 'get_firefox_prefs',
  description:
    'Get Firefox preference values via a privileged API. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var.',
  inputSchema: {
    type: 'object',
    properties: {
      names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of preference names to read',
      },
    },
    required: ['names'],
  },
};

export async function handleGetFirefoxPrefs(args: unknown): Promise<McpToolResponse> {
  try {
    const { names } = args as { names: string[] };

    if (!names || !Array.isArray(names) || names.length === 0) {
      throw new Error('names parameter is required and must be a non-empty array');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    // Get privileged ("chrome") contexts
    const result = await firefox.sendBiDiCommand('browsingContext.getTree', {
      'moz:scope': 'chrome',
    });

    const contexts = result.contexts || [];
    if (contexts.length === 0) {
      throw new Error(
        'No privileged contexts available. Ensure MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 is set.'
      );
    }

    const driver = firefox.getDriver();
    const chromeContextId = contexts[0].context;

    // Remember current context
    const originalContextId = firefox.getCurrentContextId();

    try {
      // Switch to chrome context
      await driver.switchTo().window(chromeContextId);
      await driver.setContext('chrome');

      const results: string[] = [];
      const errors: string[] = [];

      // Read each preference
      for (const name of names) {
        try {
          // Use getPrefType to determine how to read the pref
          const script = `
            (function() {
              const type = Services.prefs.getPrefType(${JSON.stringify(name)});
              if (type === Services.prefs.PREF_INVALID) {
                return { exists: false };
              } else if (type === Services.prefs.PREF_BOOL) {
                return { exists: true, value: Services.prefs.getBoolPref(${JSON.stringify(name)}) };
              } else if (type === Services.prefs.PREF_INT) {
                return { exists: true, value: Services.prefs.getIntPref(${JSON.stringify(name)}) };
              } else {
                return { exists: true, value: Services.prefs.getStringPref(${JSON.stringify(name)}) };
              }
            })()
          `;
          const prefResult = (await driver.executeScript(`return ${script}`)) as {
            exists: boolean;
            value?: unknown;
          };

          if (prefResult.exists) {
            results.push(`  ${name} = ${JSON.stringify(prefResult.value)}`);
          } else {
            results.push(`  ${name} = (not set)`);
          }
        } catch (error) {
          errors.push(`  ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const output: string[] = [];
      if (results.length > 0) {
        output.push(`📋 Firefox Preferences:`);
        output.push(...results);
      }
      if (errors.length > 0) {
        output.push(`\n⚠️ Failed to read ${errors.length} preference(s):`);
        output.push(...errors);
      }

      return successResponse(output.join('\n'));
    } finally {
      // Restore content context
      try {
        await driver.setContext('content');
        if (originalContextId) {
          await driver.switchTo().window(originalContextId);
        }
      } catch {
        // Ignore errors restoring context
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('UnsupportedOperationError')) {
      return errorResponse(
        new Error(
          'Chrome context access not enabled. Set MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 environment variable and restart Firefox.'
        )
      );
    }
    return errorResponse(error as Error);
  }
}
