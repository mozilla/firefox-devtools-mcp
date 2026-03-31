/**
 * Unit tests for console tools
 */

import { describe, it, expect } from 'vitest';
import { listConsoleMessagesTool, clearConsoleMessagesTool } from '../../src/tools/console.js';

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
  });
});
