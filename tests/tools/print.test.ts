import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printPageTool } from '../../src/tools/print.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { removeDir } from '../helpers/fs.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOCK_HOME = join(tmpdir(), 'print-test-home');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

describe('Print Tool', () => {
  it('should define print_page with optional parameters', () => {
    expect(printPageTool.name).toBe('print_page');
    const { properties } = printPageTool.inputSchema;
    expect(properties.landscape.type).toBe('boolean');
    expect(properties.background.type).toBe('boolean');
    expect(properties.saveTo.type).toEqual(['boolean', 'string']);
  });

  describe('Handler', () => {
    const FAKE_BASE64 = Buffer.from('%PDF-fake').toString('base64');
    const tempDir = join(tmpdir(), `print-test-${process.pid}`);
    const printPage = vi.fn().mockResolvedValue(FAKE_BASE64);

    beforeEach(() => {
      printPage.mockClear();
      vi.doMock('../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({ printPage }),
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

    it('should save the PDF to the given path', async () => {
      const { handlePrintPage } = await import('../../src/tools/print.js');
      const filePath = join(tempDir, 'page.pdf');
      const result = await handlePrintPage({ saveTo: filePath, landscape: true });

      expect(result.isError).toBeUndefined();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('PDF saved to:');
      expect(readFileSync(filePath)).toEqual(Buffer.from(FAKE_BASE64, 'base64'));
      expect(printPage).toHaveBeenCalledWith({ landscape: true, background: false });
    });

    it('should generate a file in the output directory without saveTo', async () => {
      const { handlePrintPage } = await import('../../src/tools/print.js');
      const result = await handlePrintPage({});

      expect(result.isError).toBeUndefined();
      const outputPath = join(MOCK_HOME, '.firefox-devtools-mcp', 'output');
      const files = readdirSync(outputPath);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^page-.*\.pdf$/);
    });
  });
});
