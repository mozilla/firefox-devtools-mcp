/**
 * Integration tests for the snapshot module, called through the MCP server
 */

import { expect } from 'vitest';
import { mcpTest } from '../../helpers/mcp.js';

mcpTest.override('mcpServerArgs', ['--tools', 'pages', 'snapshot']);

mcpTest.describe('wait_for (MCP)', () => {
  mcpTest.beforeEach(async ({ mcp }) => {
    await mcp.callTool('navigate_page', { url: 'data:text/html,<p>Ready</p>' });
  });

  mcpTest('reports how long it waited', async ({ mcp }) => {
    const result = await mcp.callTool('wait_for', { text: 'Ready' });

    expect(result.isError).toBe(false);
    expect(result.text).toMatch(/"Ready" appeared after \d+ ms/);
  });

  mcpTest('asks for either text or a selector', async ({ mcp }) => {
    const neither = await mcp.callTool('wait_for', {});
    const both = await mcp.callTool('wait_for', { text: 'Ready', selector: 'p' });

    expect(neither.isError).toBe(true);
    expect(both.isError).toBe(true);
    expect(neither.text).toContain('either text or selector');
  });
});
