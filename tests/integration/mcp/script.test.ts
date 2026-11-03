/**
 * Integration tests for evaluate_script, called through the MCP server
 */

import { expect, assert } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureUrl } from '../../helpers/firefox.js';
import { mcpTest, type McpTestServer } from '../../helpers/mcp.js';

mcpTest.override('mcpServerArgs', ['--tools', 'pages', 'snapshot', 'script']);

mcpTest.describe('evaluate_script (MCP)', () => {
  mcpTest.beforeEach(async ({ mcp }) => {
    const result = await mcp.callTool('navigate_page', { url: fixtureUrl('simple.html') });
    expect(result.isError).toBe(false);
  });

  mcpTest('returns the value of the function', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', {
      function: '() => ({ title: document.title, count: 1 + 1 })',
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('Script ran on page and returned:');
    expect(result.text).toContain('"title": "Simple Test Page"');
    expect(result.text).toContain('"count": 2');
  });

  mcpTest('awaits a returned promise', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', {
      function: '() => new Promise((r) => setTimeout(() => r("done"), 50))',
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('"done"');
  });

  mcpTest('passes snapshot UIDs as element arguments', async ({ mcp }) => {
    const snapshot = await mcp.callTool('take_snapshot');
    const uid = /uid=(\S+) button "Click Me"/.exec(snapshot.text)?.[1];
    assert(uid, 'snapshot contains the button uid');

    const result = await mcp.callTool('evaluate_script', {
      function: '(el) => el.id',
      args: [{ uid }],
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('"clickBtn"');
  });

  mcpTest('reports an unknown UID', async ({ mcp }) => {
    await mcp.callTool('take_snapshot');
    const result = await mcp.callTool('evaluate_script', {
      function: '(el) => el.id',
      args: [{ uid: 'does-not-exist' }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('does-not-exist');
  });

  mcpTest('reports an exception thrown by the function', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', {
      function: '() => { throw new Error("failure in page"); }',
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Script execution failed');
    expect(result.text).toContain('failure in page');
  });

  mcpTest('rejects a plain expression', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', { function: 'document.title' });

    expect(result.isError).toBe(true);
  });

  mcpTest('times out a function that never settles', async ({ mcp }) => {
    const result = await mcp.callTool('evaluate_script', {
      function: '() => new Promise(() => {})',
      timeout: 200,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('timed out (exceeded 200ms)');
  });

  mcpTest.describe('sandbox', () => {
    mcpTest('does not see page globals', async ({ mcp }) => {
      await mcp.callTool('evaluate_script', { function: '() => { window.pageValue = 42; }' });

      const page = await mcp.callTool('evaluate_script', {
        function: '() => typeof window.pageValue',
      });
      const sandboxed = await mcp.callTool('evaluate_script', {
        function: '() => typeof window.pageValue',
        sandbox: 'isolated',
      });

      expect(page.text).toContain('"number"');
      expect(sandboxed.text).toContain('"undefined"');
    });

    mcpTest('shares the page DOM', async ({ mcp }) => {
      const result = await mcp.callTool('evaluate_script', {
        function: '() => document.getElementById("title").textContent',
        sandbox: 'isolated',
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain('"Simple Test Page"');
    });

    mcpTest('keeps its state across calls with the same name', async ({ mcp }) => {
      await mcp.callTool('evaluate_script', {
        function: '() => { window.sandboxValue = "kept"; }',
        sandbox: 'first',
      });

      const same = await mcp.callTool('evaluate_script', {
        function: '() => window.sandboxValue ?? null',
        sandbox: 'first',
      });
      const other = await mcp.callTool('evaluate_script', {
        function: '() => window.sandboxValue ?? null',
        sandbox: 'second',
      });

      expect(same.text).toContain('"kept"');
      expect(other.text).toContain('null');
    });
  });

  mcpTest.describe('saveTo', () => {
    function outputDir(mcp: McpTestServer): string {
      return join(mcp.home, '.firefox-mcp', 'output');
    }

    mcpTest('writes the result to the given file without a preview', async ({ mcp }) => {
      const filePath = join(outputDir(mcp), 'result.json');
      const result = await mcp.callTool('evaluate_script', {
        function: '() => "x".repeat(5000)',
        saveTo: filePath,
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain(`Result saved to: ${filePath}`);
      expect(result.text).not.toContain('Preview:');
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toBe('x'.repeat(5000));
    });

    mcpTest('returns a truncated preview when asked', async ({ mcp }) => {
      const result = await mcp.callTool('evaluate_script', {
        function: '() => "x".repeat(5000)',
        saveTo: join(outputDir(mcp), 'preview.json'),
        preview: 100,
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain('Preview:');
      expect(result.text).toContain('...');
      expect(result.text).not.toContain('x'.repeat(5000));
    });

    mcpTest('ignores a non-positive preview', async ({ mcp }) => {
      const result = await mcp.callTool('evaluate_script', {
        function: '() => 1',
        saveTo: join(outputDir(mcp), 'no-preview.json'),
        preview: -1,
      });

      expect(result.isError).toBe(false);
      expect(result.text).not.toContain('Preview:');
    });

    mcpTest('writes "undefined" when the function returns nothing', async ({ mcp }) => {
      const filePath = join(outputDir(mcp), 'undefined.json');
      const result = await mcp.callTool('evaluate_script', {
        function: '() => undefined',
        saveTo: filePath,
      });

      expect(result.isError).toBe(false);
      expect(readFileSync(filePath, 'utf8')).toBe('undefined');
    });

    mcpTest('generates a file in the output directory when saveTo is true', async ({ mcp }) => {
      const result = await mcp.callTool('evaluate_script', {
        function: '() => 1',
        saveTo: true,
      });

      expect(result.isError).toBe(false);
      const savedPath = /Result saved to: (.+) \(/.exec(result.text)?.[1];
      expect(savedPath).toContain(join(outputDir(mcp), 'evaluate-script-'));
      expect(existsSync(savedPath as string)).toBe(true);
    });
  });
});
