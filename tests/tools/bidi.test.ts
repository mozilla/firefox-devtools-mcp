import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { removeDir } from '../helpers/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sendBidiCommandTool } from '../../src/tools/bidi.js';

const MOCK_HOME = join(tmpdir(), 'bidi-test-home');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

describe('BiDi Tool', () => {
  it('should require method and accept params, saveTo and preview', () => {
    expect(sendBidiCommandTool.name).toBe('send_bidi_command');
    const { properties, required } = sendBidiCommandTool.inputSchema;
    expect(required).toEqual(['method']);
    expect(properties.method.type).toBe('string');
    expect(properties.params.type).toBe('object');
    expect(properties.saveTo.type).toEqual(['boolean', 'string']);
    expect(properties.preview.type).toBe('number');
  });

  describe('Handler', () => {
    const tempDir = join(tmpdir(), `bidi-test-${process.pid}`);
    const sendBiDiCommand = vi.fn();

    beforeEach(() => {
      sendBiDiCommand.mockReset();
      vi.doMock('../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({ sendBiDiCommand }),
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

    it('should send the command and return the result as JSON', async () => {
      sendBiDiCommand.mockResolvedValue({ contexts: [{ context: 'abc' }] });
      const { handleSendBidiCommand } = await import('../../src/tools/bidi.js');

      const result = await handleSendBidiCommand({
        method: 'browsingContext.getTree',
        params: { maxDepth: 0 },
      });

      expect(sendBiDiCommand).toHaveBeenCalledWith('browsingContext.getTree', { maxDepth: 0 });
      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('"context": "abc"');
    });

    it('should default params to an empty object', async () => {
      sendBiDiCommand.mockResolvedValue({});
      const { handleSendBidiCommand } = await import('../../src/tools/bidi.js');

      await handleSendBidiCommand({ method: 'session.status' });

      expect(sendBiDiCommand).toHaveBeenCalledWith('session.status', {});
    });

    it('should save the result to a file with saveTo', async () => {
      sendBiDiCommand.mockResolvedValue({ ready: true });
      const { handleSendBidiCommand } = await import('../../src/tools/bidi.js');
      const filePath = join(tempDir, 'result.json');

      const result = await handleSendBidiCommand({ method: 'session.status', saveTo: filePath });

      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Result saved to:'
      );
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ ready: true });
    });

    it.each(['session.end', 'session.new', 'browser.close'])(
      'should refuse %s, which would end the server session',
      async (method) => {
        const { handleSendBidiCommand } = await import('../../src/tools/bidi.js');

        const result = await handleSendBidiCommand({ method });

        expect(result.isError).toBe(true);
        expect(sendBiDiCommand).not.toHaveBeenCalled();
      }
    );

    it('should report BiDi errors', async () => {
      sendBiDiCommand.mockRejectedValue(new Error('BiDi error: {"error":"unknown command"}'));
      const { handleSendBidiCommand } = await import('../../src/tools/bidi.js');

      const result = await handleSendBidiCommand({ method: 'nope.nope' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'unknown command'
      );
    });
  });
});
