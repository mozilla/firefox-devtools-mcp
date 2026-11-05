/**
 * Integration tests for accept_dialog and dismiss_dialog, called through the MCP server
 */

import { assert, describe, expect } from 'vitest';
import { mcpTest, type McpTestServer } from '../../helpers/mcp.js';
import { fixtureUrl, waitFor } from '../../helpers/firefox.js';

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

  mcpTest('evaluate_script should return when a dialog opens', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', {
      function: `() => alert('foo')`,
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Dialog opened while tool was running: alert "foo"');

    const accepted = await mcp.callTool('accept_dialog');
    expect(accepted.isError).toBe(false);
    expect(accepted.text).toContain('Accepted');
  });

  mcpTest('click_by_uid should return when a dialog opens', async ({ mcp }) => {
    await mcp.callTool('navigate_page', { url: fixtureUrl('simple.html') });
    await mcp.callTool('evaluate_script', {
      function: `() => document.getElementById('clickBtn').addEventListener('click', () => alert('foo'))`,
    });
    const snapshot = await mcp.callTool('take_snapshot');
    const uid = /uid=(\S+) button "Click Me"/.exec(snapshot.text)?.[1];
    assert(uid, 'snapshot contains the button uid');

    const result = await mcp.callTool('click_by_uid', { uid });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Dialog opened while tool was running: alert "foo"');

    const accepted = await mcp.callTool('accept_dialog');
    expect(accepted.isError).toBe(false);
    expect(accepted.text).toContain('Accepted');
  });

  mcpTest(
    `accept_dialog without promptText should use a prompt's default value`,
    async ({ mcp }) => {
      await mcp.callTool('evaluate_script', {
        function: `() => window.result = prompt('foo', 'default value')`,
      });

      const accepted = await mcp.callTool('accept_dialog');
      expect(accepted.isError).toBe(false);
      expect(accepted.text).toBe('Accepted: "default value"');

      const result = await mcp.callTool('evaluate_script', {
        function: '() => window.result',
      });
      expect(result.isError).toBe(false);
      expect(result.text).toContain('default value');
    }
  );

  mcpTest(
    `accept_dialog should override a prompt's default value with an empty string`,
    async ({ mcp }) => {
      await mcp.callTool('evaluate_script', {
        function: `() => window.result = prompt('foo', 'default value')`,
      });

      const accepted = await mcp.callTool('accept_dialog', { promptText: '' });
      expect(accepted.isError).toBe(false);
      expect(accepted.text).toBe('Accepted: ""');

      const result = await mcp.callTool('evaluate_script', {
        function: '() => window.result',
      });
      expect(result.isError).toBe(false);
      expect(result.text).toContain('""');
    }
  );

  mcpTest(
    'accept_dialog should ignore promptText if the current dialog is not a prompt',
    async ({ mcp }) => {
      await mcp.callTool('evaluate_script', {
        function: `() => alert('foo')`,
      });

      const accepted = await mcp.callTool('accept_dialog', { promptText: 'bar' });
      expect(accepted.isError).toBe(false);
      expect(accepted.text).toBe('Accepted');
    }
  );
});
