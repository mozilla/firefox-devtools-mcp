/**
 * Unit tests for network tools
 */

import { describe, it, expect } from 'vitest';
import { listNetworkRequestsTool, getNetworkRequestTool } from '../../src/tools/network.js';

describe('Network Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(listNetworkRequestsTool.name).toBe('list_network_requests');
      expect(getNetworkRequestTool.name).toBe('get_network_request');
    });

    it('should have valid descriptions', () => {
      expect(listNetworkRequestsTool.description).toContain('network');
      expect(getNetworkRequestTool.description).toContain('request');
    });

    it('should have valid input schemas', () => {
      expect(listNetworkRequestsTool.inputSchema.type).toBe('object');
      expect(getNetworkRequestTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('listNetworkRequestsTool should have filtering options', () => {
      const { properties } = listNetworkRequestsTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.urlContains).toBeDefined();
      expect(properties?.method).toBeDefined();
      expect(properties?.resourceType).toBeDefined();
      expect(properties?.status).toBeDefined();
      expect(properties?.statusMin).toBeDefined();
      expect(properties?.statusMax).toBeDefined();
    });

    it('listNetworkRequestsTool should have limit and sorting options', () => {
      const { properties } = listNetworkRequestsTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.limit).toBeDefined();
      expect(properties?.sortBy).toBeDefined();
      expect(properties?.sortBy.enum).toContain('timestamp');
    });

    it('getNetworkRequestTool should have id or url options', () => {
      const { properties } = getNetworkRequestTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.url).toBeDefined();
    });

    it('format property should have enum values', () => {
      const { properties } = listNetworkRequestsTool.inputSchema;
      expect(properties?.format).toBeDefined();
      expect(properties?.format.enum).toContain('text');
      expect(properties?.format.enum).toContain('json');
    });
  });
});
