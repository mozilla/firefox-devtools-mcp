/**
 * Integration tests for evaluate_script, called through the MCP server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureUrl } from '../../helpers/firefox.js';
import { startMcpServer, type McpTestServer } from '../../helpers/mcp.js';

describe('evaluate_script (MCP)', () => {
  let server: McpTestServer | undefined;

  function mcp(): McpTestServer {
    if (!server) {
      throw new Error('MCP server did not start');
    }
    return server;
  }

  beforeAll(async () => {
    server = await startMcpServer(['--tools', 'pages', 'snapshot', 'script']);
  });

  afterAll(async () => {
    await server?.close();
  });

  beforeEach(async () => {
    const result = await mcp().callTool('navigate_page', { url: fixtureUrl('simple.html') });
    expect(result.isError).toBe(false);
  });

  it('returns the value of the function', async () => {
    const result = await mcp().callTool('evaluate_script', {
      function: '() => ({ title: document.title, count: 1 + 1 })',
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('Script ran on page and returned:');
    expect(result.text).toContain('"title": "Simple Test Page"');
    expect(result.text).toContain('"count": 2');
  });

  it('awaits a returned promise', async () => {
    const result = await mcp().callTool('evaluate_script', {
      function: '() => new Promise((r) => setTimeout(() => r("done"), 50))',
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('"done"');
  });

  it('passes snapshot UIDs as element arguments', async () => {
    const snapshot = await mcp().callTool('take_snapshot');
    const uid = /uid=(\S+) button "Click Me"/.exec(snapshot.text)?.[1];
    expect(uid).toBeDefined();

    const result = await mcp().callTool('evaluate_script', {
      function: '(el) => el.id',
      args: [{ uid }],
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('"clickBtn"');
  });

  it('reports an unknown UID', async () => {
    await mcp().callTool('take_snapshot');
    const result = await mcp().callTool('evaluate_script', {
      function: '(el) => el.id',
      args: [{ uid: 'does-not-exist' }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('does-not-exist');
  });

  it('reports an exception thrown by the function', async () => {
    const result = await mcp().callTool('evaluate_script', {
      function: '() => { throw new Error("failure in page"); }',
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Script execution failed');
    expect(result.text).toContain('failure in page');
  });

  it('rejects a plain expression', async () => {
    const result = await mcp().callTool('evaluate_script', { function: 'document.title' });

    expect(result.isError).toBe(true);
  });

  it('times out a function that never settles', async () => {
    const result = await mcp().callTool('evaluate_script', {
      function: '() => new Promise(() => {})',
      timeout: 200,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('timed out (exceeded 200ms)');
  });

  describe('sandbox', () => {
    it('does not see page globals', async () => {
      await mcp().callTool('evaluate_script', { function: '() => { window.pageValue = 42; }' });

      const page = await mcp().callTool('evaluate_script', {
        function: '() => typeof window.pageValue',
      });
      const sandboxed = await mcp().callTool('evaluate_script', {
        function: '() => typeof window.pageValue',
        sandbox: 'isolated',
      });

      expect(page.text).toContain('"number"');
      expect(sandboxed.text).toContain('"undefined"');
    });

    it('shares the page DOM', async () => {
      const result = await mcp().callTool('evaluate_script', {
        function: '() => document.getElementById("title").textContent',
        sandbox: 'isolated',
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain('"Simple Test Page"');
    });

    it('keeps its state across calls with the same name', async () => {
      await mcp().callTool('evaluate_script', {
        function: '() => { window.sandboxValue = "kept"; }',
        sandbox: 'first',
      });

      const same = await mcp().callTool('evaluate_script', {
        function: '() => window.sandboxValue ?? null',
        sandbox: 'first',
      });
      const other = await mcp().callTool('evaluate_script', {
        function: '() => window.sandboxValue ?? null',
        sandbox: 'second',
      });

      expect(same.text).toContain('"kept"');
      expect(other.text).toContain('null');
    });
  });

  describe('saveTo', () => {
    function outputDir(): string {
      return join(mcp().home, '.firefox-devtools-mcp', 'output');
    }

    it('writes the result to the given file without a preview', async () => {
      const filePath = join(outputDir(), 'result.json');
      const result = await mcp().callTool('evaluate_script', {
        function: '() => "x".repeat(5000)',
        saveTo: filePath,
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain(`Result saved to: ${filePath}`);
      expect(result.text).not.toContain('Preview:');
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toBe('x'.repeat(5000));
    });

    it('returns a truncated preview when asked', async () => {
      const result = await mcp().callTool('evaluate_script', {
        function: '() => "x".repeat(5000)',
        saveTo: join(outputDir(), 'preview.json'),
        preview: 100,
      });

      expect(result.isError).toBe(false);
      expect(result.text).toContain('Preview:');
      expect(result.text).toContain('...');
      expect(result.text).not.toContain('x'.repeat(5000));
    });

    it('ignores a non-positive preview', async () => {
      const result = await mcp().callTool('evaluate_script', {
        function: '() => 1',
        saveTo: join(outputDir(), 'no-preview.json'),
        preview: -1,
      });

      expect(result.isError).toBe(false);
      expect(result.text).not.toContain('Preview:');
    });

    it('writes "undefined" when the function returns nothing', async () => {
      const filePath = join(outputDir(), 'undefined.json');
      const result = await mcp().callTool('evaluate_script', {
        function: '() => undefined',
        saveTo: filePath,
      });

      expect(result.isError).toBe(false);
      expect(readFileSync(filePath, 'utf8')).toBe('undefined');
    });

    it('generates a file in the output directory when saveTo is true', async () => {
      const result = await mcp().callTool('evaluate_script', {
        function: '() => 1',
        saveTo: true,
      });

      expect(result.isError).toBe(false);
      const savedPath = /Result saved to: (.+) \(/.exec(result.text)?.[1];
      expect(savedPath).toContain(join(outputDir(), 'evaluate-script-'));
      expect(existsSync(savedPath as string)).toBe(true);
    });
  });
});
