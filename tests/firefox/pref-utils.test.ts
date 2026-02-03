/**
 * Tests for Firefox preference utilities
 */

import { describe, it, expect } from 'vitest';
import { generatePrefScript } from '../../src/firefox/pref-utils.js';

describe('generatePrefScript', () => {
  it('should generate setBoolPref for true', () => {
    expect(generatePrefScript('p', true)).toBe('Services.prefs.setBoolPref("p", true)');
  });

  it('should generate setBoolPref for false', () => {
    expect(generatePrefScript('p', false)).toBe('Services.prefs.setBoolPref("p", false)');
  });

  it('should generate setIntPref for number', () => {
    expect(generatePrefScript('p', 42)).toBe('Services.prefs.setIntPref("p", 42)');
  });

  it('should generate setStringPref for string', () => {
    expect(generatePrefScript('p', 'v')).toBe('Services.prefs.setStringPref("p", "v")');
  });

  it('should escape quotes in values', () => {
    expect(generatePrefScript('p', 'a"b')).toBe('Services.prefs.setStringPref("p", "a\\"b")');
  });

  it('should escape quotes in preference names', () => {
    expect(generatePrefScript('p"ref', 'v')).toBe('Services.prefs.setStringPref("p\\"ref", "v")');
  });

  it('should handle negative numbers', () => {
    expect(generatePrefScript('p', -10)).toBe('Services.prefs.setIntPref("p", -10)');
  });

  it('should handle empty string value', () => {
    expect(generatePrefScript('p', '')).toBe('Services.prefs.setStringPref("p", "")');
  });
});
