/**
 * WebExtension tools for MCP
 * Tools for installing, managing and inspecting Firefox extensions
 *
 * install/uninstall: Uses Firefox's native WebDriver BiDi webExtension module
 * list_extensions: Uses chrome-privileged AddonManager API as workaround for
 *                  missing webExtension.getExtensions BiDi command
 *
 * Note: list_extensions requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1
 */

import { successResponse, errorResponse } from '../utils/response-helpers.js';
import type { McpToolResponse } from '../types/common.js';

// ============================================================================
// Tool: install_extension
// ============================================================================

export const installExtensionTool = {
  name: 'install_extension',
  description:
    'Install a Firefox extension using WebDriver BiDi webExtension.install command. Supports installing from archive (.xpi/.zip), base64-encoded data, or unpacked directory.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['archivePath', 'base64', 'path'],
        description:
          'Extension data type: "archivePath" for .xpi/.zip, "base64" for encoded data, "path" for unpacked directory',
      },
      path: {
        type: 'string',
        description: 'File path (for archivePath or path types)',
      },
      value: {
        type: 'string',
        description: 'Base64-encoded extension data (for base64 type)',
      },
      permanent: {
        type: 'boolean',
        description:
          'Firefox-specific: Install permanently (requires signed extension). Default: false (temporary install)',
      },
    },
    required: ['type'],
  },
};

export async function handleInstallExtension(args: unknown): Promise<McpToolResponse> {
  try {
    const { type, path, value, permanent } = args as {
      type: 'archivePath' | 'base64' | 'path';
      path?: string;
      value?: string;
      permanent?: boolean;
    };

    if (!type) {
      throw new Error('type parameter is required');
    }

    // Validate required fields based on type
    if ((type === 'archivePath' || type === 'path') && !path) {
      throw new Error(`path parameter is required for type "${type}"`);
    }
    if (type === 'base64' && !value) {
      throw new Error('value parameter is required for type "base64"');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    // Build extensionData parameter
    const extensionData: Record<string, string> = { type };
    if (path) {
      extensionData.path = path;
    }
    if (value) {
      extensionData.value = value;
    }

    // Build BiDi command parameters
    const params: Record<string, any> = { extensionData };
    if (permanent !== undefined) {
      params['moz:permanent'] = permanent;
    }

    const result = await firefox.sendBiDiCommand('webExtension.install', params);

    const extensionId = result?.extension || 'unknown';
    const installType = permanent ? 'permanent' : 'temporary';

    return successResponse(
      `✅ Extension installed (${installType}):\n  ID: ${extensionId}\n  Type: ${type}${path ? `\n  Path: ${path}` : ''}`
    );
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: uninstall_extension
// ============================================================================

export const uninstallExtensionTool = {
  name: 'uninstall_extension',
  description:
    'Uninstall a Firefox extension using WebDriver BiDi webExtension.uninstall command. Requires the extension ID returned by install_extension or obtained from list_extensions.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Extension ID (e.g., "addon@example.com")',
      },
    },
    required: ['id'],
  },
};

export async function handleUninstallExtension(args: unknown): Promise<McpToolResponse> {
  try {
    const { id } = args as { id: string };

    if (!id || typeof id !== 'string') {
      throw new Error('id parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await firefox.sendBiDiCommand('webExtension.uninstall', { extension: id });

    return successResponse(`✅ Extension uninstalled:\n  ID: ${id}`);
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: list_extensions
// ============================================================================

export const listExtensionsTool = {
  name: 'list_extensions',
  description:
    // MOZ_REMOTE_ALLOW_SYSTEM_ACCESS is required because the tool relies on the
    // privileged AddonManager API as a workaround for the currently missing
    // webExtension.getExtensions WebDriver BiDi command.
    'List installed Firefox extensions with UUIDs and background scripts. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Filter by exact extension IDs (e.g., ["addon@example.com"])',
      },
      name: {
        type: 'string',
        description: 'Optional: Filter by partial name match (case-insensitive, e.g., "shopify")',
      },
      isActive: {
        type: 'boolean',
        description: 'Optional: Filter by enabled (true) or disabled (false) status',
      },
      isSystem: {
        type: 'boolean',
        description:
          'Optional: Filter by system/built-in (true) or user-installed (false) extensions',
      },
    },
  },
};

interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  isSystem: boolean;
  uuid: string;
  baseURL: string;
  backgroundScripts: string[];
  manifestVersion: number | null;
}

function formatExtensionList(extensions: ExtensionInfo[], filterId?: string): string {
  if (extensions.length === 0) {
    return filterId ? `🔍 Extension not found: ${filterId}` : '📦 No extensions installed';
  }

  const lines: string[] = [
    `📦 ${extensions.length} extension(s)${filterId ? ` (filtered by: ${filterId})` : ''}`,
  ];

  for (const ext of extensions) {
    lines.push('');
    lines.push(`  📌 ${ext.name} (v${ext.version})`);
    lines.push(`     ID: ${ext.id}`);
    lines.push(`     Type: ${ext.isSystem ? '🔧 System/Built-in' : '👤 User-installed'}`);
    lines.push(`     UUID: ${ext.uuid}`);
    lines.push(`     Base URL: ${ext.baseURL}`);
    lines.push(`     Manifest: v${ext.manifestVersion || 'unknown'}`);
    lines.push(`     Active: ${ext.isActive ? '✅' : '❌'}`);

    if (ext.backgroundScripts.length > 0) {
      lines.push(`     Background scripts:`);
      for (const script of ext.backgroundScripts) {
        const scriptName = script.split('/').pop();
        lines.push(`       • ${scriptName}`);
      }
    } else {
      lines.push(`     Background scripts: (none)`);
    }
  }

  return lines.join('\n');
}

export async function handleListExtensions(args: unknown): Promise<McpToolResponse> {
  try {
    const { ids, name, isActive, isSystem } =
      (args as {
        ids?: string[];
        name?: string;
        isActive?: boolean;
        isSystem?: boolean;
      }) || {};

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
    const originalContextId = firefox.getCurrentContextId();

    try {
      // Switch to chrome context
      await driver.switchTo().window(chromeContextId);
      await driver.setContext('chrome');

      // Execute chrome-privileged script to get extensions
      // Use executeAsyncScript for async operations
      const filterParams = { ids, name, isActive, isSystem };
      const script = `
        const callback = arguments[arguments.length - 1];
        const filter = ${JSON.stringify(filterParams)};
        (async () => {
          try {
            const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
            let addons = await AddonManager.getAllAddons();

            // Filter to only extensions (not themes, plugins, etc.)
            addons = addons.filter(addon => addon.type === "extension");

            // Apply filters
            if (filter.ids && filter.ids.length > 0) {
              addons = addons.filter(addon => filter.ids.includes(addon.id));
            }
            if (filter.name) {
              const search = filter.name.toLowerCase();
              addons = addons.filter(addon => addon.name.toLowerCase().includes(search));
            }
            if (typeof filter.isActive === 'boolean') {
              addons = addons.filter(addon => addon.isActive === filter.isActive);
            }
            if (typeof filter.isSystem === 'boolean') {
              addons = addons.filter(addon => addon.isSystem === filter.isSystem);
            }

            const extensions = [];
            for (const addon of addons) {
              const policy = WebExtensionPolicy.getByID(addon.id);
              if (!policy) continue; // Skip if no policy (addon not loaded)

              extensions.push({
                id: addon.id,
                name: addon.name,
                version: addon.version,
                isActive: addon.isActive,
                isSystem: addon.isSystem,
                uuid: policy.mozExtensionHostname,
                baseURL: policy.baseURL,
                backgroundScripts: policy.extension?.backgroundScripts || [],
                manifestVersion: policy.extension?.manifest?.manifest_version || null
              });
            }

            callback(extensions);
          } catch (error) {
            callback([]);
          }
        })();
      `;

      const extensions = (await driver.executeAsyncScript(script)) as ExtensionInfo[];

      // Build filter description for output
      const filterDesc = [
        ids && ids.length > 0 ? `ids: [${ids.join(', ')}]` : null,
        name ? `name: "${name}"` : null,
        typeof isActive === 'boolean' ? `active: ${isActive}` : null,
        typeof isSystem === 'boolean' ? `system: ${isSystem}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      return successResponse(formatExtensionList(extensions, filterDesc || undefined));
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
