/**
 * Smoke tests for firefox-devtools-mcp
 *
 * These tests verify basic functionality without requiring a Firefox instance.
 * More comprehensive integration tests should be added as the project matures.
 */

import { describe, it, expect } from 'vitest';
import { SERVER_NAME, SERVER_VERSION } from '../src/config/constants.js';

describe('Smoke Tests', () => {
  describe('Constants', () => {
    it('should have correct server name', () => {
      expect(SERVER_NAME).toBe('firefox-devtools');
    });

    it('should have valid server version', () => {
      expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
      expect(SERVER_VERSION).toBe('0.7.1');
    });
  });

  describe('Module imports', () => {
    it('should import tools without errors', async () => {
      const { listPagesTool } = await import('../src/tools/pages.js');
      const { takeSnapshotTool } = await import('../src/tools/snapshot.js');
      const { listConsoleMessagesTool } = await import('../src/tools/console.js');
      const { listNetworkRequestsTool } = await import('../src/tools/network.js');

      expect(listPagesTool).toBeDefined();
      expect(listPagesTool.name).toBe('list_pages');
      expect(takeSnapshotTool).toBeDefined();
      expect(takeSnapshotTool.name).toBe('take_snapshot');
      expect(listConsoleMessagesTool).toBeDefined();
      expect(listConsoleMessagesTool.name).toBe('list_console_messages');
      expect(listNetworkRequestsTool).toBeDefined();
      expect(listNetworkRequestsTool.name).toBe('list_network_requests');
    });

    it('should import utils without errors', async () => {
      const responseHelpers = await import('../src/utils/response-helpers.js');

      expect(responseHelpers.successResponse).toBeDefined();
      expect(responseHelpers.errorResponse).toBeDefined();
      expect(responseHelpers.jsonResponse).toBeDefined();
    });
  });

  describe('Tool schemas', () => {
    it('should have valid inputSchema for pages tools', async () => {
      const { listPagesTool, selectPageTool, navigatePageTool } = await import(
        '../src/tools/pages.js'
      );

      expect(listPagesTool.inputSchema).toBeDefined();
      expect(listPagesTool.inputSchema.type).toBe('object');

      expect(selectPageTool.inputSchema).toBeDefined();
      expect(selectPageTool.inputSchema.type).toBe('object');

      expect(navigatePageTool.inputSchema).toBeDefined();
      expect(navigatePageTool.inputSchema.type).toBe('object');
    });

    it('should have valid inputSchema for snapshot tool', async () => {
      const { takeSnapshotTool } = await import('../src/tools/snapshot.js');

      expect(takeSnapshotTool.inputSchema).toBeDefined();
      expect(takeSnapshotTool.inputSchema.type).toBe('object');
      expect(takeSnapshotTool.inputSchema.properties).toBeDefined();
      expect(takeSnapshotTool.inputSchema.properties?.maxLines).toBeDefined();
      expect(takeSnapshotTool.inputSchema.properties?.includeAttributes).toBeDefined();
      expect(takeSnapshotTool.inputSchema.properties?.includeText).toBeDefined();
      expect(takeSnapshotTool.inputSchema.properties?.maxDepth).toBeDefined();
    });

    it('should have valid inputSchema for console tool', async () => {
      const { listConsoleMessagesTool } = await import('../src/tools/console.js');

      expect(listConsoleMessagesTool.inputSchema).toBeDefined();
      expect(listConsoleMessagesTool.inputSchema.type).toBe('object');
      expect(listConsoleMessagesTool.inputSchema.properties).toBeDefined();
      expect(listConsoleMessagesTool.inputSchema.properties?.level).toBeDefined();
      expect(listConsoleMessagesTool.inputSchema.properties?.textContains).toBeDefined();
      expect(listConsoleMessagesTool.inputSchema.properties?.source).toBeDefined();
      expect(listConsoleMessagesTool.inputSchema.properties?.format).toBeDefined();
    });

    it('should have valid inputSchema for network tool', async () => {
      const { listNetworkRequestsTool } = await import('../src/tools/network.js');

      expect(listNetworkRequestsTool.inputSchema).toBeDefined();
      expect(listNetworkRequestsTool.inputSchema.type).toBe('object');
      expect(listNetworkRequestsTool.inputSchema.properties).toBeDefined();
      expect(listNetworkRequestsTool.inputSchema.properties?.urlContains).toBeDefined();
      expect(listNetworkRequestsTool.inputSchema.properties?.method).toBeDefined();
      expect(listNetworkRequestsTool.inputSchema.properties?.format).toBeDefined();
    });
  });

  describe('Response helpers', () => {
    it('should create success response', async () => {
      const { successResponse } = await import('../src/utils/response-helpers.js');

      const response = successResponse('Test message');

      expect(response).toHaveProperty('content');
      expect(response.content).toEqual([
        {
          type: 'text',
          text: 'Test message',
        },
      ]);
    });

    it('should create error response', async () => {
      const { errorResponse } = await import('../src/utils/response-helpers.js');

      const response = errorResponse('Test error');

      expect(response).toHaveProperty('content');
      expect(response.content).toEqual([
        {
          type: 'text',
          text: 'Error: Test error',
        },
      ]);
      expect(response).toHaveProperty('isError', true);
    });

    it('should create JSON response', async () => {
      const { jsonResponse } = await import('../src/utils/response-helpers.js');

      const data = { foo: 'bar', count: 42 };
      const response = jsonResponse(data);

      expect(response).toHaveProperty('content');
      expect(response.content).toEqual([
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ]);
    });
  });
});
