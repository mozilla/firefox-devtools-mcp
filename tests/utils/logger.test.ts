/**
 * Unit tests for logger utilities
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  log,
  logError,
  logDebug,
  setupLogFile,
  flushLogs,
  closeLogFile,
} from '../../src/utils/logger.js';

describe('Logger Utilities', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.DEBUG;
  });

  describe('log', () => {
    it('should log messages with prefix', () => {
      log('Test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[firefox-devtools-mcp] Test message');
    });

    it('should log messages with additional arguments', () => {
      log('Test message', 'arg1', 123);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[firefox-devtools-mcp] Test message',
        'arg1',
        123
      );
    });
  });

  describe('logError', () => {
    it('should log error with message', () => {
      const error = new Error('Test error');
      logError('Something failed', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[firefox-devtools-mcp] ERROR: Something failed',
        'Test error'
      );
    });

    it('should log error stack when available', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n  at line 1';

      logError('Something failed', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });

    it('should log non-Error objects', () => {
      logError('Something failed', { code: 500 });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[firefox-devtools-mcp] ERROR: Something failed',
        { code: 500 }
      );
    });

    it('should log without error object', () => {
      logError('Something failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[firefox-devtools-mcp] ERROR: Something failed',
        undefined
      );
    });
  });

  describe('logDebug', () => {
    it('should not log when DEBUG is not set', () => {
      logDebug('Debug message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log when DEBUG is *', () => {
      process.env.DEBUG = '*';
      logDebug('Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[firefox-devtools-mcp] DEBUG: Debug message');
    });

    it('should log when DEBUG includes firefox-devtools', () => {
      process.env.DEBUG = 'firefox-devtools';
      logDebug('Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[firefox-devtools-mcp] DEBUG: Debug message');
    });

    it('should log when DEBUG includes firefox-devtools with other modules', () => {
      process.env.DEBUG = 'app,firefox-devtools,other';
      logDebug('Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[firefox-devtools-mcp] DEBUG: Debug message');
    });

    it('should not log when DEBUG does not include firefox-devtools', () => {
      process.env.DEBUG = 'other-module';
      logDebug('Debug message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log with additional arguments', () => {
      process.env.DEBUG = '*';
      logDebug('Debug message', 'arg1', 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[firefox-devtools-mcp] DEBUG: Debug message',
        'arg1',
        123
      );
    });
  });

  describe('file logger', () => {
    let tmpFile: string;

    beforeEach(() => {
      tmpFile = join(mkdtempSync(join(tmpdir(), 'logger-test-')), 'out.log');
      setupLogFile(tmpFile);
    });

    afterEach(async () => {
      await flushLogs();
      closeLogFile();
      rmSync(tmpFile, { force: true });
    });

    it('should write log lines with timestamp prefix', async () => {
      log('hello', 'world');
      await flushLogs();
      const content = readFileSync(tmpFile, 'utf8');
      expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T.*\[firefox-devtools-mcp\] hello world\n$/);
    });

    it('should write error with stack to file', async () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at test';
      logError('failed', err);
      await flushLogs();
      const content = readFileSync(tmpFile, 'utf8');
      expect(content).toContain('[firefox-devtools-mcp] ERROR: failed boom');
      expect(content).toContain('Error: boom\n    at test');
    });

    it('should not throw on circular reference', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(() => log('circular', obj)).not.toThrow();
    });

    it('should fall back to String() for circular reference', async () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      log('circular', obj);
      await flushLogs();
      const content = readFileSync(tmpFile, 'utf8');
      expect(content).toContain('[firefox-devtools-mcp] circular');
    });

    it('should write debug log to file when DEBUG is set', async () => {
      process.env.DEBUG = '*';
      logDebug('dbg msg');
      await flushLogs();
      const content = readFileSync(tmpFile, 'utf8');
      expect(content).toContain('[firefox-devtools-mcp] DEBUG: dbg msg');
    });

    it('should not write to console when file logger is active', () => {
      log('file only');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
