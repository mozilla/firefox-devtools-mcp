/**
 * Runs the MCP server from source in a child process and talks to it over
 * stdio, so tests go through the same path as a real MCP client: CLI parsing,
 * tool registry, handlers, Firefox, and response formatting.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeDir } from './fs.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export interface ToolResult {
  text: string;
  isError: boolean;
}

export interface McpTestServer {
  /** Temporary home directory of the server process. */
  home: string;
  callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

/**
 * @param serverArgs CLI arguments appended after `--headless`.
 */
export async function startMcpServer(serverArgs: string[] = []): Promise<McpTestServer> {
  const home = mkdtempSync(join(tmpdir(), 'mcp-test-home-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', join(repoRoot, 'src/index.moz.ts'), '--headless', ...serverArgs],
    cwd: repoRoot,
    env: {
      ...(process.env as Record<string, string>),
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: 'production',
    },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'firefox-devtools-mcp-tests', version: '0.0.0' });
  await client.connect(transport);

  return {
    home,
    async callTool(name, args = {}) {
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: 60000,
      });
      const content = result.content as Array<{ type: string; text?: string }>;
      return {
        text: content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n'),
        isError: result.isError === true,
      };
    },
    async close() {
      try {
        await client.close();
      } finally {
        removeDir(home);
      }
    },
  };
}
