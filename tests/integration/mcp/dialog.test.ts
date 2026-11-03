/**
 * Integration tests for accept_dialog and dismiss_dialog, called through the MCP server
 */

import { describe, expect } from 'vitest';
import { mcpTest, type McpTestServer } from '../../helpers/mcp.js';
import { waitFor } from '../../helpers/firefox.js';

async function getResult(mcp: McpTestServer) {
  return (await mcp.callTool('evaluate_script', { function: '() => window.result' })).text;
}

describe('Dialog handlers', () => {
  describe.each([
    {
      method: 'alert',
      acceptExpectation: 'undefined',
      dismissExpectation: 'undefined',
    },
    {
      method: 'confirm',
      acceptExpectation: 'true',
      dismissExpectation: 'false',
    },
    {
      method: 'prompt',
      acceptExpectation: '"bar"',
      dismissExpectation: 'null',
    },
  ])('$method dialog', ({ method, acceptExpectation, dismissExpectation }) => {
    mcpTest.beforeEach(async ({ mcp }) => {
      await mcp.callTool('evaluate_script', {
        function: `() => { window.result = 'pending'; setTimeout(() => { window.result = ${method}('foo'); }); }`,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(await getResult(mcp)).toContain('"pending"');
    });

    mcpTest('should be left open until it is accepted', async ({ mcp }) => {
      const result = await mcp.callTool(
        'accept_dialog',
        method === 'prompt' ? { promptText: 'bar' } : undefined
      );
      expect(result.isError).toBe(false);
      expect(result.text).toContain('Accepted');

      await waitFor(async () => !(await getResult(mcp)).includes('"pending"'));
      expect(await getResult(mcp)).toContain(acceptExpectation);
    });

    mcpTest('should be left open until it is dismissed', async ({ mcp }) => {
      const result = await mcp.callTool('dismiss_dialog');
      expect(result.isError).toBe(false);
      expect(result.text).toContain('Dismissed');

      await waitFor(async () => !(await getResult(mcp)).includes('"pending"'));
      expect(await getResult(mcp)).toContain(dismissExpectation);
    });
  });

  mcpTest('accept_dialog should fail if there is no dialog', async ({ mcp }) => {
    const result = await mcp.callTool('accept_dialog');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Failed to accept dialog');
  });

  mcpTest('dismiss_dialog should fail if there is no dialog', async ({ mcp }) => {
    const result = await mcp.callTool('dismiss_dialog');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Failed to dismiss dialog');
  });
});
