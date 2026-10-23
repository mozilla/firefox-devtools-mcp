/**
 * Unit tests for pages tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listPagesTool,
  selectPageTool,
  navigatePageTool,
  newPageTool,
  closePageTool,
  getPageTextTool,
} from '../../../src/tools/pages.js';

describe('Pages Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(listPagesTool.name).toBe('list_pages');
      expect(selectPageTool.name).toBe('select_page');
      expect(navigatePageTool.name).toBe('navigate_page');
      expect(newPageTool.name).toBe('new_page');
      expect(closePageTool.name).toBe('close_page');
    });

    it('should have valid descriptions', () => {
      expect(listPagesTool.description).toContain('tab');
      expect(selectPageTool.description).toContain('Select');
      expect(navigatePageTool.description).toContain('Navigate');
      expect(newPageTool.description).toContain('new');
      expect(closePageTool.description).toContain('Close');
    });

    it('should have valid input schemas', () => {
      expect(listPagesTool.inputSchema.type).toBe('object');
      expect(selectPageTool.inputSchema.type).toBe('object');
      expect(navigatePageTool.inputSchema.type).toBe('object');
      expect(newPageTool.inputSchema.type).toBe('object');
      expect(closePageTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('selectPageTool should accept pageIdx, url, or title', () => {
      const { properties } = selectPageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.pageIdx).toBeDefined();
      expect(properties?.url).toBeDefined();
      expect(properties?.title).toBeDefined();
    });

    it('navigatePageTool should require url', () => {
      const { properties } = navigatePageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.url).toBeDefined();
      expect(properties?.url.type).toBe('string');
    });

    it('newPageTool should accept url', () => {
      const { properties } = newPageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.url).toBeDefined();
    });

    it.each([
      ['navigatePageTool', navigatePageTool],
      ['newPageTool', newPageTool],
    ])('%s should expose an optional wait enum', (_name, tool) => {
      const schema = tool.inputSchema as {
        properties?: Record<string, any>;
        required?: string[];
      };
      expect(schema.properties?.wait).toBeDefined();
      expect(schema.properties?.wait.type).toBe('string');
      expect(schema.properties?.wait.enum).toEqual(['none', 'interactive', 'complete']);
      expect(schema.required).not.toContain('wait');
    });

    it('closePageTool should require pageIdx', () => {
      const { properties, required } = closePageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.pageIdx).toBeDefined();
      expect(required).toContain('pageIdx');
    });
  });

  describe('Content Tools', () => {
    it('should have correct tool name', () => {
      expect(getPageTextTool.name).toBe('get_page_text');
    });

    it('should expose maxLength, saveTo, and preview without marking them required', () => {
      const schema = getPageTextTool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.properties?.maxLength).toBeDefined();
      expect(schema.properties?.saveTo).toBeDefined();
      expect(schema.properties?.preview).toBeDefined();
      expect(schema.required).toBeUndefined();
    });
  });

  describe('Content Tools: handler behavior', () => {
    const LONG_TEXT = 'y'.repeat(30000);
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `pages-test-${Date.now()}`);

      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          evaluate: vi.fn().mockResolvedValue(LONG_TEXT),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(tempDir)) {
        removeDir(tempDir);
      }
    });

    it('should truncate inline output to maxLength with an escape-hatch footer', async () => {
      const { handleGetPageText } = await import('../../../src/tools/pages.js');
      const result = await handleGetPageText({ maxLength: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('chars hidden');
      expect(text).toContain('saveTo');
      expect(text.length).toBeLessThan(LONG_TEXT.length);
    });

    it('should return content inline with a completeness marker when it fits maxLength', async () => {
      const { handleGetPageText } = await import('../../../src/tools/pages.js');
      const result = await handleGetPageText({ maxLength: LONG_TEXT.length });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain(LONG_TEXT);
      expect(text).toContain(`[full content, ${LONG_TEXT.length} chars]`);
    });

    it('should save the full text untruncated when saveTo is used', async () => {
      const { handleGetPageText } = await import('../../../src/tools/pages.js');
      const filePath = join(tempDir, 'page.txt');
      const result = await handleGetPageText({ saveTo: filePath, maxLength: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('saved to:');
      expect(readFileSync(filePath, 'utf8')).toBe(LONG_TEXT);
    });

    it('should include a preview when preview is given', async () => {
      const { handleGetPageText } = await import('../../../src/tools/pages.js');
      const result = await handleGetPageText({ saveTo: join(tempDir, 'page.txt'), preview: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Preview:');
    });
  });

  describe('Navigation handlers: wait argument', () => {
    let navigate: ReturnType<typeof vi.fn>;
    let createNewPage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      navigate = vi.fn().mockResolvedValue(undefined);
      createNewPage = vi.fn().mockResolvedValue(1);

      vi.doMock('../../../src/index.js', () => ({
        args: {},
        getFirefox: vi.fn().mockResolvedValue({
          navigate,
          createNewPage,
          refreshTabs: vi.fn().mockResolvedValue(undefined),
          getTabs: vi.fn().mockReturnValue([{ url: 'about:blank', title: 'blank' }]),
          getSelectedTabIdx: vi.fn().mockReturnValue(0),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
    });

    it('passes an explicit wait through to navigate', async () => {
      const { handleNavigatePage } = await import('../../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com', wait: 'complete' });

      expect(navigate).toHaveBeenCalledWith('https://example.com', 'complete');
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('waited for: complete');
    });

    it('leaves the default in place when wait is omitted', async () => {
      const { handleNavigatePage } = await import('../../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com' });

      expect(navigate).toHaveBeenCalledWith('https://example.com', undefined);
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).not.toContain('waited for');
    });

    it('passes an explicit wait through to new_page', async () => {
      const { handleNewPage } = await import('../../../src/tools/pages.js');
      await handleNewPage({ url: 'https://example.com', wait: 'complete' });

      expect(createNewPage).toHaveBeenCalledWith('https://example.com', 'complete');
    });

    it('rejects an unknown wait value instead of silently ignoring it', async () => {
      const { handleNavigatePage } = await import('../../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com', wait: 'load' });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('wait must be one of none, interactive, complete');
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
