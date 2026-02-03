/**
 * Tests for statement detection and rejection in privileged context tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluatePrivilegedScriptTool,
  handleEvaluatePrivilegedScript,
  isLikelyStatement,
} from '../../src/tools/privileged-context.js';

// Mock the index module (used by handler tests)
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

describe('Privileged Context Tool Definitions', () => {
  describe('evaluatePrivilegedScriptTool', () => {
    it('should have correct name', () => {
      expect(evaluatePrivilegedScriptTool.name).toBe('evaluate_privileged_script');
    });

    it('should mention expression in description', () => {
      expect(evaluatePrivilegedScriptTool.description).toContain('expression');
    });
  });
});

describe('isLikelyStatement', () => {
  it('should detect const declarations', () => {
    expect(isLikelyStatement('const x = 1')).toBe(true);
  });

  it('should detect let declarations', () => {
    expect(isLikelyStatement('let x = 1')).toBe(true);
  });

  it('should detect var declarations', () => {
    expect(isLikelyStatement('var x = 1')).toBe(true);
  });

  it('should allow function calls', () => {
    expect(isLikelyStatement('Services.prefs.getBoolPref("foo")')).toBe(false);
  });

  it('should allow simple expressions', () => {
    expect(isLikelyStatement('1 + 2')).toBe(false);
  });

  it('should allow property access', () => {
    expect(isLikelyStatement('document.title')).toBe(false);
  });

  it('should handle leading whitespace', () => {
    expect(isLikelyStatement('  const x = 1')).toBe(true);
  });
});

describe('Privileged Context Tool Handlers', () => {
  const mockExecuteScript = vi.fn();
  const mockSetContext = vi.fn();
  const mockSwitchToWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleEvaluatePrivilegedScript', () => {
    it('should reject const statements with error', async () => {
      const result = await handleEvaluatePrivilegedScript({ expression: 'const x = 1' });

      expect(result.isError).toBe(true);
    });

    it('should mention "statement" in error message', async () => {
      const result = await handleEvaluatePrivilegedScript({ expression: 'const x = 1' });

      expect(result.content[0]).toHaveProperty('text', expect.stringMatching(/statement/i));
    });

    it('should suggest IIFE workaround in error message', async () => {
      const result = await handleEvaluatePrivilegedScript({ expression: 'const x = 1' });

      expect(result.content[0].text).toContain('function()');
    });

    it('should return error when expression parameter is missing', async () => {
      const result = await handleEvaluatePrivilegedScript({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('expression parameter is required');
    });

    it('should execute valid expressions successfully', async () => {
      const mockFirefox = {
        getDriver: vi.fn().mockReturnValue({
          switchTo: () => ({ window: mockSwitchToWindow }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript.mockResolvedValue('test-result'),
        }),
      };

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({ expression: 'document.title' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('test-result');
    });

    it('should reject let statements', async () => {
      const result = await handleEvaluatePrivilegedScript({ expression: 'let y = 2' });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('text', expect.stringMatching(/statement/i));
    });

    it('should reject var statements', async () => {
      const result = await handleEvaluatePrivilegedScript({ expression: 'var z = 3' });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('text', expect.stringMatching(/statement/i));
    });
  });
});
