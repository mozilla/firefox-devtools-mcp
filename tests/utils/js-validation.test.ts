import { describe, it, expect } from 'vitest';
import {
  isLikelyFunctionBody,
  isLikelyStatement,
  validateFunction,
} from '../../src/utils/js-validation.js';

describe('validateFunction', () => {
  it('accepts arrow function', () => {
    expect(() => validateFunction('() => document.title')).not.toThrow();
  });

  it('accepts async arrow function', () => {
    expect(() => validateFunction('async () => { return await fetch("/api") }')).not.toThrow();
  });

  it('accepts function declaration', () => {
    expect(() => validateFunction('function() { return 1; }')).not.toThrow();
  });

  it('accepts async function declaration', () => {
    expect(() => validateFunction('async function() { return 1; }')).not.toThrow();
  });

  it('rejects plain expression', () => {
    expect(() => validateFunction('document.title')).toThrow('Invalid function format');
  });

  it('rejects empty string', () => {
    expect(() => validateFunction('')).toThrow('function parameter is required');
  });

  it('rejects oversized function', () => {
    expect(() => validateFunction('() => ' + 'x'.repeat(16 * 1024))).toThrow('Function too large');
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

describe('isLikelyFunctionBody', () => {
  it('should detect return with a value', () => {
    expect(isLikelyFunctionBody('return document.title')).toBe(true);
  });

  it('should detect return followed by semicolon', () => {
    expect(isLikelyFunctionBody('return;')).toBe(true);
  });

  it('should detect bare return', () => {
    expect(isLikelyFunctionBody('return')).toBe(true);
  });

  it('should handle leading whitespace', () => {
    expect(isLikelyFunctionBody('  return x')).toBe(true);
  });

  it('should allow expressions', () => {
    expect(isLikelyFunctionBody('document.title')).toBe(false);
  });

  it('should allow IIFEs', () => {
    expect(isLikelyFunctionBody('(function() { return 1; })()')).toBe(false);
  });

  it('should not match identifiers starting with return', () => {
    expect(isLikelyFunctionBody('returnValue')).toBe(false);
  });
});
