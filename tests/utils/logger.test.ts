/**
 * Unit tests for logger utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logError, logDebug } from '../../src/utils/logger.js';

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
});
