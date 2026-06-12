import { describe, it, expect } from 'vitest';
import { validateFunction } from '../../src/utils/js-validation.js';

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
