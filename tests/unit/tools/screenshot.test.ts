/**
 * Unit tests for screenshot tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screenshotPageTool, screenshotByUidTool } from '../../../src/tools/screenshot.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOCK_HOME = join(tmpdir(), 'screenshot-test-home');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

describe('Screenshot Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(screenshotPageTool.name).toBe('screenshot_page');
      expect(screenshotByUidTool.name).toBe('screenshot_by_uid');
    });

    it('should have valid descriptions', () => {
      expect(screenshotPageTool.description).toContain('screenshot');
      expect(screenshotByUidTool.description).toContain('screenshot');
      expect(screenshotByUidTool.description).toContain('element');
    });

    it('should have valid input schemas', () => {
      expect(screenshotPageTool.inputSchema.type).toBe('object');
      expect(screenshotByUidTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('screenshotPageTool should have saveTo property', () => {
      const { properties } = screenshotPageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo?.type).toEqual(['boolean', 'string']);
    });

    it('screenshotPageTool should have fullPage property', () => {
      const { properties } = screenshotPageTool.inputSchema;
      expect(properties?.fullPage).toBeDefined();
      expect(properties?.fullPage?.type).toBe('boolean');
    });

    it('screenshotByUidTool should require uid and have optional saveTo', () => {
      const { properties, required } = screenshotByUidTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.uid).toBeDefined();
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo?.type).toEqual(['boolean', 'string']);
      expect(required).toContain('uid');
      expect(required).not.toContain('saveTo');
    });
  });

  describe('Handler: saveTo behavior', () => {
    const FAKE_BASE64 = Buffer.from('fake-png-data').toString('base64');
    const tempDir = join(tmpdir(), `screenshot-test-${process.pid}`);

    beforeEach(() => {
      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          takeScreenshotPage: vi.fn().mockResolvedValue(FAKE_BASE64),
          takeScreenshotByUid: vi.fn().mockResolvedValue(FAKE_BASE64),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      for (const dir of [tempDir, MOCK_HOME]) {
        if (existsSync(dir)) {
          removeDir(dir);
        }
      }
    });

    it('should save screenshot to a file when saveTo is provided (page)', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      const filePath = join(tempDir, 'page.png');
      const result = await handleScreenshotPage({ saveTo: filePath });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Screenshot saved to:');
      expect(text).toContain('KB)');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath)).toEqual(Buffer.from(FAKE_BASE64, 'base64'));
    });

    it('should save screenshot to a file when saveTo is provided (by uid)', async () => {
      const { handleScreenshotByUid } = await import('../../../src/tools/screenshot.js');
      const filePath = join(tempDir, 'element.png');
      const result = await handleScreenshotByUid({ uid: 'test-uid', saveTo: filePath });

      expect(result.isError).toBeUndefined();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Screenshot saved to:'
      );
      expect(existsSync(filePath)).toBe(true);
    });

    it('should create parent directories when they do not exist', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      const filePath = join(tempDir, 'nested', 'deep', 'screenshot.png');
      const result = await handleScreenshotPage({ saveTo: filePath });

      expect(result.isError).toBeUndefined();
      expect(existsSync(filePath)).toBe(true);
    });

    it('should save to a generated file in the default output dir when saveTo is true', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      const result = await handleScreenshotPage({ saveTo: true });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Screenshot saved to:');
      expect(text).toContain(join(MOCK_HOME, '.firefox-devtools-mcp', 'output'));
      expect(text).toContain('screenshot-');
    });

    it('should return image content when saveTo is not provided (page)', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      const result = await handleScreenshotPage({});

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'image');
      expect(result.content[0]).toHaveProperty('data', FAKE_BASE64);
      expect(result.content[0]).toHaveProperty('mimeType', 'image/png');
    });

    it('should return image content when saveTo is not provided (by uid)', async () => {
      const { handleScreenshotByUid } = await import('../../../src/tools/screenshot.js');
      const result = await handleScreenshotByUid({ uid: 'test-uid' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'image');
      expect(result.content[0]).toHaveProperty('data', FAKE_BASE64);
      expect(result.content[0]).toHaveProperty('mimeType', 'image/png');
    });
  });

  describe('Handler: fullPage behavior', () => {
    const FAKE_BASE64 = Buffer.from('fake-png-data').toString('base64');
    let takeScreenshotPage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      takeScreenshotPage = vi.fn().mockResolvedValue(FAKE_BASE64);
      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({ takeScreenshotPage }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should request a viewport screenshot by default', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      await handleScreenshotPage({});

      expect(takeScreenshotPage).toHaveBeenCalledWith(false);
    });

    it('should request a full page screenshot when fullPage is true', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      await handleScreenshotPage({ fullPage: true });

      expect(takeScreenshotPage).toHaveBeenCalledWith(true);
    });
  });

  describe('Handler: saveTo restriction', () => {
    const FAKE_BASE64 = Buffer.from('fake-png-data').toString('base64');
    const outside = join(tmpdir(), `screenshot-restrict-${process.pid}.png`);

    beforeEach(() => {
      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: false },
        getFirefox: vi.fn().mockResolvedValue({
          takeScreenshotPage: vi.fn().mockResolvedValue(FAKE_BASE64),
          takeScreenshotByUid: vi.fn().mockResolvedValue(FAKE_BASE64),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(outside)) {
        rmSync(outside, { force: true });
      }
    });

    it('should reject an absolute saveTo outside the allowed directory', async () => {
      const { handleScreenshotPage } = await import('../../../src/tools/screenshot.js');
      const result = await handleScreenshotPage({ saveTo: outside });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        '--unrestricted-save-paths'
      );
      expect(existsSync(outside)).toBe(false);
    });
  });
});
