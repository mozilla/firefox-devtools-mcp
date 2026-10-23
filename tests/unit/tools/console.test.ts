/**
 * Unit tests for console tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listConsoleMessagesTool, clearConsoleMessagesTool } from '../../../src/tools/console.js';

describe('Console Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(listConsoleMessagesTool.name).toBe('list_console_messages');
      expect(clearConsoleMessagesTool.name).toBe('clear_console_messages');
    });

    it('should have valid descriptions', () => {
      expect(listConsoleMessagesTool.description).toContain('console');
      expect(clearConsoleMessagesTool.description).toContain('Clear');
    });

    it('should have valid input schemas', () => {
      expect(listConsoleMessagesTool.inputSchema.type).toBe('object');
      expect(clearConsoleMessagesTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('listConsoleMessagesTool should have filtering options', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.level).toBeDefined();
      expect(properties?.textContains).toBeDefined();
      expect(properties?.source).toBeDefined();
      expect(properties?.limit).toBeDefined();
    });

    it('level property should have enum values', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties?.level).toBeDefined();
      expect(properties?.level.enum).toContain('error');
      expect(properties?.level.enum).toContain('warn');
      expect(properties?.level.enum).toContain('info');
      expect(properties?.level.enum).toContain('debug');
    });

    it('source property should be a string filter', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties?.source).toBeDefined();
      expect(properties?.source.type).toBe('string');
    });

    it('format property should have enum values', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties?.format).toBeDefined();
      expect(properties?.format.enum).toContain('text');
      expect(properties?.format.enum).toContain('json');
    });

    it('should have optional saveTo parameter of type boolean|string', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo.type).toEqual(['boolean', 'string']);
    });

    it('should have optional numeric preview parameter', () => {
      const { properties } = listConsoleMessagesTool.inputSchema;
      expect(properties?.preview).toBeDefined();
      expect(properties?.preview.type).toBe('number');
    });

    it('should not mark saveTo or preview as required', () => {
      expect(
        (listConsoleMessagesTool.inputSchema as { required?: string[] }).required
      ).toBeUndefined();
    });
  });

  describe('Handler: saveTo behavior', () => {
    const LONG_TEXT = 'y'.repeat(3000);
    const MESSAGES = [
      { level: 'info', text: 'first message', source: 'console-api', timestamp: 1700000000000 },
      { level: 'error', text: LONG_TEXT, source: 'javascript', timestamp: 1700000001000 },
      { level: 'warn', text: 'third message', source: 'console-api', timestamp: 1700000002000 },
    ];
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `console-test-${Date.now()}`);

      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          getConsoleMessages: vi.fn().mockResolvedValue(MESSAGES),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(tempDir)) {
        removeDir(tempDir);
      }
    });

    it('should save all matching messages in full without truncation', async () => {
      const { handleListConsoleMessages } = await import('../../../src/tools/console.js');
      const filePath = join(tempDir, 'console.txt');
      const result = await handleListConsoleMessages({ saveTo: filePath });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('saved to:');
      const fileContent = readFileSync(filePath, 'utf8');
      expect(fileContent).toContain(LONG_TEXT);
      expect(fileContent).not.toContain('...[truncated]');
    });

    it('should include a preview when preview is given', async () => {
      const { handleListConsoleMessages } = await import('../../../src/tools/console.js');
      const result = await handleListConsoleMessages({
        saveTo: join(tempDir, 'console.txt'),
        preview: 100,
      });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Preview:');
    });

    it('should write JSON with all messages when format is json', async () => {
      const { handleListConsoleMessages } = await import('../../../src/tools/console.js');
      const filePath = join(tempDir, 'console.json');
      await handleListConsoleMessages({ saveTo: filePath, format: 'json' });

      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.total).toBe(3);
      expect(parsed.filtered).toBe(3);
    });

    it('should honor an explicit limit when saving to a file', async () => {
      const { handleListConsoleMessages } = await import('../../../src/tools/console.js');
      const filePath = join(tempDir, 'console.json');
      await handleListConsoleMessages({ saveTo: filePath, format: 'json', limit: 1 });

      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.saved).toBe(1);
      expect(parsed.filtered).toBe(3);
    });

    it('should still write a file when no messages match', async () => {
      const { handleListConsoleMessages } = await import('../../../src/tools/console.js');
      const filePath = join(tempDir, 'console.json');
      const result = await handleListConsoleMessages({
        saveTo: filePath,
        format: 'json',
        textContains: 'no-such-message-zzz',
      });

      expect(result.isError).toBeUndefined();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('saved to:');
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed.messages).toHaveLength(0);
      expect(parsed.saved).toBe(0);
    });
  });
});
