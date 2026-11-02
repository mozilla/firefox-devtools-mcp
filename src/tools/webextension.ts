/**
 * WebExtension tools for MCP
 * Tools for installing, managing and inspecting Firefox extensions
 *
 * install/uninstall/list: Uses Firefox's native WebDriver BiDi webExtension module
 */

import type { WebExtension } from 'webdriver-bidi-protocol';
import type { FirefoxCommands } from '../firefox/bidi.js';
import { successResponse } from '../utils/response-helpers.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';
import type { FirefoxDevTools } from '../firefox/index.js';
import { compareVersions } from '../utils/version.js';

// ============================================================================
// Tool: install_extension
// ============================================================================

const MIN_FIREFOX_VERSION = '158.0';

function checkListExtensionsSupported(firefox: FirefoxDevTools): void {
  const version = firefox.getFirefoxVersion();
  if (version !== null && compareVersions(version, MIN_FIREFOX_VERSION) < 0) {
    throw new Error(
      `Listing extensions requires Firefox ${MIN_FIREFOX_VERSION.split('.')[0]} or later (connected: ${version})`
    );
  }
}

export const installExtensionTool = {
  name: 'install_extension',
  description:
    'Install a Firefox extension using WebDriver BiDi webExtension.install command. Supports installing from archive (.xpi/.zip), base64-encoded data, or unpacked directory.',
  annotations: {
    readOnlyHint: false,
  },
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
} as const satisfies ToolDefinition;

export const handleInstallExtension = defineToolHandler<typeof installExtensionTool>(
  async (args): Promise<McpToolResponse> => {
    const { type, path, value, permanent } = args;

    if (!type) {
      throw new Error('type parameter is required');
    }

    // Validate required fields based on type
    let extensionData!: WebExtension.ExtensionData;
    if (type === 'archivePath' || type === 'path') {
      if (!path) {
        throw new Error(`path parameter is required for type "${type}"`);
      }
      extensionData = { type, path };
    } else {
      if (!value) {
        throw new Error('value parameter is required for type "base64"');
      }
      extensionData = { type, value };
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    // Build BiDi command parameters
    const params: FirefoxCommands['webExtension.install']['params'] = { extensionData };
    if (permanent !== undefined) {
      params['moz:permanent'] = permanent;
    }

    const result = await firefox.sendBiDiCommand('webExtension.install', params);

    const extensionId = result?.extension || 'unknown';
    const installType = permanent ? 'permanent' : 'temporary';

    return successResponse(
      `Extension installed (${installType}):\n  ID: ${extensionId}\n  Type: ${type}${path ? `\n  Path: ${path}` : ''}`
    );
  }
);

// ============================================================================
// Tool: uninstall_extension
// ============================================================================

export const uninstallExtensionTool = {
  name: 'uninstall_extension',
  description:
    'Uninstall a Firefox extension using WebDriver BiDi webExtension.uninstall command. Requires the extension ID returned by install_extension or obtained from list_extensions.',
  annotations: {
    readOnlyHint: false,
  },
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
} as const satisfies ToolDefinition;

export const handleUninstallExtension = defineToolHandler<typeof uninstallExtensionTool>(
  async (args): Promise<McpToolResponse> => {
    const { id } = args;

    if (!id || typeof id !== 'string') {
      throw new Error('id parameter is required and must be a string');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await firefox.sendBiDiCommand('webExtension.uninstall', { extension: id });

    return successResponse(`Extension uninstalled:\n  ID: ${id}`);
  }
);

// ============================================================================
// Tool: list_extensions
// ============================================================================

export const listExtensionsTool = {
  name: 'list_extensions',
  description:
    'List installed Firefox extensions using the WebDriver BiDi webExtension.moz:listExtensions command.',
  annotations: {
    readOnlyHint: true,
  },
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
    },
  },
} as const satisfies ToolDefinition;

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
    return filterId ? `Extension not found: ${filterId}` : 'No extensions installed';
  }

  const lines: string[] = [
    `${extensions.length} extension(s)${filterId ? ` (filtered by: ${filterId})` : ''}`,
  ];

  for (const ext of extensions) {
    lines.push('');
    lines.push(`  ${ext.name} (v${ext.version})`);
    lines.push(`     ID: ${ext.id}`);
    lines.push(`     Type: ${ext.isSystem ? 'System/Built-in' : 'User-installed'}`);
    lines.push(`     UUID: ${ext.uuid}`);
    lines.push(`     Base URL: ${ext.baseURL}`);
    lines.push(`     Manifest: v${ext.manifestVersion || 'unknown'}`);
    lines.push(`     Active: ${ext.isActive ? 'yes' : 'no'}`);

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

export const handleListExtensions = defineToolHandler<typeof listExtensionsTool>(
  async (args): Promise<McpToolResponse> => {
    // Check whether Firefox version is supported
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkListExtensionsSupported(firefox);

    // Handle listing extensions
    const { ids, name, isActive } = args;

    const matched = await firefox.listExtensions({ ids, name, isActive });

    const extensions = matched.map((extension): ExtensionInfo => {
      const policy = extension.policy;
      return {
        id: extension.id,
        name: extension.name,
        version: extension.version,
        isActive: extension.isActive,
        isSystem: extension.isSystem,
        uuid:
          policy === undefined
            ? '`uuid` omitted due to restricted system access.'
            : (policy?.uuid ?? 'Unavailable (e.g. disabled extension)'),
        baseURL:
          policy === undefined
            ? '`baseURL` omitted due to restricted system access.'
            : (policy?.baseURL ?? 'Unavailable (e.g. disabled extension)'),
        backgroundScripts: policy?.backgroundScripts ?? [],
        manifestVersion: extension.manifestVersion,
      };
    });

    const filterDescription = [
      ids && ids.length > 0 ? `ids: [${ids.join(', ')}]` : null,
      name ? `name: "${name}"` : null,
      typeof isActive === 'boolean' ? `active: ${isActive}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return successResponse(formatExtensionList(extensions, filterDescription || undefined));
  }
);

export const module = defineModule({
  name: 'webextension',
  description: 'Install, uninstall, and list web extensions.',
  tools: [
    [installExtensionTool, handleInstallExtension],
    [uninstallExtensionTool, handleUninstallExtension],
    [listExtensionsTool, handleListExtensions],
  ],
});
