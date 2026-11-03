/**
 * Integration tests for list_extensions, called through the MCP server
 */

import { expect } from 'vitest';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import { compareVersions } from '@/utils/version.js';
import { fixturesPath } from '../../helpers/firefox.js';
import { mcpTest } from '../../helpers/mcp.js';

mcpTest.override('mcpServerArgs', ['--tools', 'webextension', 'management']);

const extensionDir = resolve(fixturesPath, 'test-extension');
// Own filename: moz-extension.test.ts packs the same fixture as test-extension.xpi
const xpiPath = resolve(fixturesPath, 'test-extension-mcp.xpi');

function packExtension(): void {
  // Packed in-process: the `zip` binary does not exist on Windows
  const entries = Object.fromEntries(
    ['manifest.json', 'popup.html'].map((name) => [name, readFileSync(resolve(extensionDir, name))])
  );
  writeFileSync(xpiPath, zipSync(entries));
}

mcpTest.describe('list_extensions (MCP)', () => {
  let extensionId = '';
  let listExtensionsSupported = false;

  mcpTest.beforeAll(async ({ mcp }) => {
    packExtension();

    // webExtension.moz:listExtensions needs Firefox 158
    const info = await mcp.callTool('get_firefox_info');
    const version = /Firefox version: (\d+)/.exec(info.text)?.[1];
    listExtensionsSupported = version !== undefined && compareVersions(version, '158.0') >= 0;
    if (!listExtensionsSupported) {
      return;
    }

    const empty = await mcp.callTool('list_extensions');
    expect(empty.text).toBe('No extensions installed');

    const installed = await mcp.callTool('install_extension', {
      type: 'archivePath',
      path: xpiPath,
    });
    expect(installed.isError).toBe(false);
    extensionId = /ID: (\S+)/.exec(installed.text)?.[1] ?? '';
    expect(extensionId).toBeTruthy();
  }, 60000);

  mcpTest.afterAll(async ({ mcp }) => {
    try {
      if (extensionId) {
        await mcp.callTool('uninstall_extension', { id: extensionId });
      }
    } finally {
      if (existsSync(xpiPath)) {
        unlinkSync(xpiPath);
      }
    }
  });

  mcpTest.beforeEach(({ skip }) => {
    if (!listExtensionsSupported) {
      console.warn('Skipping list_extensions tests: requires Firefox 158 or later');
      skip();
    }
  });

  mcpTest('formats the extension list', async ({ mcp }) => {
    const result = await mcp.callTool('list_extensions', { ids: [extensionId] });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('1 extension(s)');
    expect(result.text).toContain(`(filtered by: ids: [${extensionId}])`);
    expect(result.text).toContain('  MCP Test Extension (v1.0)');
    expect(result.text).toContain(`ID: ${extensionId}`);
    expect(result.text).toContain('Type: User-installed');
    expect(result.text).toContain('Manifest: v2');
    expect(result.text).toContain('Active: yes');
    expect(result.text).toContain('Background scripts: (none)');
  });

  mcpTest('reports policy fields omitted without system access', async ({ mcp }) => {
    const result = await mcp.callTool('list_extensions', { ids: [extensionId] });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('UUID: `uuid` omitted due to restricted system access.');
    expect(result.text).toContain('Base URL: `baseURL` omitted due to restricted system access.');
  });

  mcpTest('describes the filters when nothing matches', async ({ mcp }) => {
    const result = await mcp.callTool('list_extensions', {
      ids: [extensionId],
      name: 'no-such-extension',
      isActive: true,
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('Extension not found:');
    expect(result.text).toContain(`ids: [${extensionId}]`);
    expect(result.text).toContain('name: "no-such-extension"');
    expect(result.text).toContain('active: true');
  });
});
