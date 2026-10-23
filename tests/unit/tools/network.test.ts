/**
 * Unit tests for network tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listNetworkRequestsTool,
  getNetworkRequestTool,
  setNetworkCacheTool,
} from '../../../src/tools/network.js';

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

  describe('set_network_cache', () => {
    let setCacheBehavior: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      setCacheBehavior = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../../src/index.js', () => ({
        args: {},
        getFirefox: vi.fn().mockResolvedValue({ setCacheBehavior }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
    });

    const textOf = (r: { content: Array<{ type: string; text?: string }> }) =>
      (r.content[0] as { type: 'text'; text: string }).text;

    it('exposes a behavior enum and an optional scope', () => {
      expect(setNetworkCacheTool.name).toBe('set_network_cache');
      const { properties, required } = setNetworkCacheTool.inputSchema;
      expect(properties?.behavior.enum).toEqual(['default', 'bypass']);
      expect(properties?.scope.enum).toEqual(['tab', 'global']);
      expect(required).toEqual(['behavior']);
      expect(required).not.toContain('scope');
    });

    it('scopes to the selected tab by default', async () => {
      const { handleSetNetworkCache } = await import('../../../src/tools/network.js');
      const result = await handleSetNetworkCache({ behavior: 'bypass' });

      expect(setCacheBehavior).toHaveBeenCalledWith('bypass', { global: false });
      expect(textOf(result)).toContain('selected tab');
    });

    it('applies browser-wide when scope is global', async () => {
      const { handleSetNetworkCache } = await import('../../../src/tools/network.js');
      const result = await handleSetNetworkCache({ behavior: 'bypass', scope: 'global' });

      expect(setCacheBehavior).toHaveBeenCalledWith('bypass', { global: true });
      expect(textOf(result)).toContain('all tabs');
    });

    it('tells the caller how to restore caching after a bypass', async () => {
      const { handleSetNetworkCache } = await import('../../../src/tools/network.js');
      const bypass = await handleSetNetworkCache({ behavior: 'bypass' });
      expect(textOf(bypass)).toContain("behavior='default'");

      const restore = await handleSetNetworkCache({ behavior: 'default' });
      expect(setCacheBehavior).toHaveBeenLastCalledWith('default', { global: false });
      expect(textOf(restore)).not.toContain("behavior='default' to restore");
    });

    it('rejects an unknown behavior instead of defaulting to cached', async () => {
      const { handleSetNetworkCache } = await import('../../../src/tools/network.js');
      const result = await handleSetNetworkCache({ behavior: 'disabled' });

      expect(textOf(result)).toContain('behavior must be one of default, bypass');
      expect(setCacheBehavior).not.toHaveBeenCalled();
    });

    it('rejects an unknown scope instead of silently using the tab', async () => {
      const { handleSetNetworkCache } = await import('../../../src/tools/network.js');
      const result = await handleSetNetworkCache({ behavior: 'bypass', scope: 'everything' });

      expect(textOf(result)).toContain("scope must be 'tab' or 'global'");
      expect(setCacheBehavior).not.toHaveBeenCalled();
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

    it('listNetworkRequestsTool should have optional saveTo and preview', () => {
      const { properties } = listNetworkRequestsTool.inputSchema;
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo.type).toEqual(['boolean', 'string']);
      expect(properties?.preview.type).toBe('number');
    });

    it('getNetworkRequestTool should have optional saveTo and preview', () => {
      const { properties } = getNetworkRequestTool.inputSchema;
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo.type).toEqual(['boolean', 'string']);
      expect(properties?.preview.type).toBe('number');
    });

    it('should not mark saveTo or preview as required', () => {
      expect(
        (listNetworkRequestsTool.inputSchema as { required?: string[] }).required
      ).toBeUndefined();
      expect(
        (getNetworkRequestTool.inputSchema as { required?: string[] }).required
      ).toBeUndefined();
    });
  });

  describe('Handler: saveTo behavior', () => {
    const LONG_HEADER = 'z'.repeat(600);
    const REQUESTS = [
      {
        id: 'r1',
        url: 'https://example.test/one',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        resourceType: 'document',
        isXHR: false,
        timestamp: 1700000000000,
        timings: { duration: 12 },
        requestHeaders: { 'x-big': LONG_HEADER },
        responseHeaders: { 'content-type': 'text/html' },
      },
      {
        id: 'r2',
        url: 'https://example.test/two',
        method: 'POST',
        status: 201,
        statusText: 'Created',
        resourceType: 'xhr',
        isXHR: true,
        timestamp: 1700000001000,
        timings: { duration: 34 },
        requestHeaders: { 'x-small': 'ok' },
        responseHeaders: {},
      },
    ];
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `network-test-${Date.now()}`);

      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          getNetworkRequests: vi.fn().mockResolvedValue(REQUESTS),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(tempDir)) {
        removeDir(tempDir);
      }
    });

    it('should save all requests with full untruncated headers', async () => {
      const { handleListNetworkRequests } = await import('../../../src/tools/network.js');
      const filePath = join(tempDir, 'network.json');
      const result = await handleListNetworkRequests({ saveTo: filePath });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('saved to:');
      const raw = readFileSync(filePath, 'utf8');
      expect(raw).toContain(LONG_HEADER);
      expect(raw).not.toContain('...[truncated]');
      expect(raw).not.toContain('__truncated__');
    });

    it('should honor an explicit limit when saving to a file', async () => {
      const { handleListNetworkRequests } = await import('../../../src/tools/network.js');
      const filePath = join(tempDir, 'network.json');
      await handleListNetworkRequests({ saveTo: filePath, limit: 1 });

      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed.requests).toHaveLength(1);
      expect(parsed.saved).toBe(1);
      expect(parsed.total).toBe(2);
    });

    it('should save a lean form without headers when detail is summary', async () => {
      const { handleListNetworkRequests } = await import('../../../src/tools/network.js');
      const filePath = join(tempDir, 'network.json');
      await handleListNetworkRequests({ saveTo: filePath, detail: 'summary' });

      const raw = readFileSync(filePath, 'utf8');
      expect(raw).not.toContain(LONG_HEADER);
      const parsed = JSON.parse(raw);
      expect(parsed.detail).toBe('summary');
      expect(parsed.requests[0]).not.toHaveProperty('requestHeaders');
      expect(parsed.requests[0]).toHaveProperty('duration');
    });

    it('should still write a file when no requests match', async () => {
      const { handleListNetworkRequests } = await import('../../../src/tools/network.js');
      const filePath = join(tempDir, 'network.json');
      const result = await handleListNetworkRequests({
        saveTo: filePath,
        urlContains: 'no-such-url-zzz',
      });

      expect(result.isError).toBeUndefined();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('saved to:');
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed.requests).toHaveLength(0);
      expect(parsed.saved).toBe(0);
    });

    it('should save a single request with raw headers by id', async () => {
      const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
      const filePath = join(tempDir, 'request.json');
      const result = await handleGetNetworkRequest({ id: 'r1', saveTo: filePath });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Request r1 saved to:');
      const raw = readFileSync(filePath, 'utf8');
      expect(raw).toContain(LONG_HEADER);
      expect(raw).not.toContain('...[truncated]');
    });
  });

  describe('Handler: response bodies', () => {
    const REQUESTS = [
      {
        id: 'r1',
        url: 'https://example.test/data.json',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        resourceType: 'xhr',
        isXHR: true,
        timestamp: 1700000000000,
        timings: { duration: 12 },
        requestHeaders: {},
        responseHeaders: { 'content-type': 'application/json' },
      },
    ];

    function mockFirefox(fetchBody: (id: string, dataType: string) => Promise<unknown>) {
      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          getNetworkRequests: vi.fn().mockResolvedValue(REQUESTS),
          getNetworkRequestBody: vi.fn(fetchBody),
        }),
      }));
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should include a text response body inline', async () => {
      mockFirefox(async (_id, dataType) =>
        dataType === 'response'
          ? { ok: true, type: 'string', value: '{"hello":"world"}' }
          : { ok: false, reason: 'not-collected' }
      );

      const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
      const result = await handleGetNetworkRequest({ id: 'r1' });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(parsed.responseBody).toBe('{"hello":"world"}');
      // GET with no request body: requestBody must be omitted, not shown as a marker.
      expect(parsed).not.toHaveProperty('requestBody');
    });

    it('should summarize a binary response body instead of dumping base64', async () => {
      mockFirefox(async (_id, dataType) =>
        dataType === 'response'
          ? { ok: true, type: 'base64', value: 'AAAA'.repeat(1000) }
          : { ok: false, reason: 'not-collected' }
      );

      const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
      const result = await handleGetNetworkRequest({ id: 'r1' });

      const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(parsed.responseBody).toContain('binary data');
      expect(parsed.responseBody).toContain('saveTo');
      expect(parsed.responseBodyEncoding).toBe('base64');
    });

    it('should render a marker when the body was not captured', async () => {
      mockFirefox(async () => ({ ok: false, reason: 'not-collected' }));

      const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
      const result = await handleGetNetworkRequest({ id: 'r1' });

      const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(parsed.responseBody).toBe('<not captured>');
    });

    it('should degrade gracefully when body capture is unsupported', async () => {
      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          getNetworkRequests: vi.fn().mockResolvedValue(REQUESTS),
        }),
      }));

      const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
      const result = await handleGetNetworkRequest({ id: 'r1' });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
      expect(parsed.responseBody).toContain('not supported');
    });

    it('should save the full untruncated body to a file', async () => {
      const bigBody = 'x'.repeat(60_000);
      mockFirefox(async (_id, dataType) =>
        dataType === 'response'
          ? { ok: true, type: 'string', value: bigBody }
          : { ok: false, reason: 'not-collected' }
      );

      const tempDir = join(tmpdir(), `network-body-test-${Date.now()}`);
      const filePath = join(tempDir, 'request.json');
      try {
        const { handleGetNetworkRequest } = await import('../../../src/tools/network.js');
        const result = await handleGetNetworkRequest({ id: 'r1', saveTo: filePath });

        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
        expect(parsed.responseBody).toBe(bigBody);
        expect(parsed.responseBody).not.toContain('truncated');
        expect(parsed.responseBodyEncoding).toBe('utf-8');
      } finally {
        if (existsSync(tempDir)) {
          removeDir(tempDir);
        }
      }
    });
  });
});
