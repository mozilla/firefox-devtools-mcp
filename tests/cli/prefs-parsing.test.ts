/**
 * Tests for preference parsing (parsePrefs function) and CLI --pref option
 */

import { describe, it, expect } from 'vitest';
import { parsePrefs, parseArguments } from '../../src/cli.js';

describe('parsePrefs', () => {
  // Step 1.1
  it('should return empty object for undefined input', () => {
    expect(parsePrefs(undefined)).toEqual({});
  });

  // Step 1.2
  it('should return empty object for empty array', () => {
    expect(parsePrefs([])).toEqual({});
  });

  // Step 1.3
  it('should parse simple string preference', () => {
    expect(parsePrefs(['some.pref=value'])).toEqual({ 'some.pref': 'value' });
  });

  // Step 1.4
  it('should parse boolean true', () => {
    expect(parsePrefs(['some.pref=true'])).toEqual({ 'some.pref': true });
  });

  // Step 1.5
  it('should parse boolean false', () => {
    expect(parsePrefs(['some.pref=false'])).toEqual({ 'some.pref': false });
  });

  // Step 1.6
  it('should parse integer', () => {
    expect(parsePrefs(['some.pref=42'])).toEqual({ 'some.pref': 42 });
  });

  // Step 1.7
  it('should parse negative integer', () => {
    expect(parsePrefs(['some.pref=-5'])).toEqual({ 'some.pref': -5 });
  });

  // Step 1.8
  it('should keep float as string (Firefox has no float pref)', () => {
    expect(parsePrefs(['some.pref=3.14'])).toEqual({ 'some.pref': '3.14' });
  });

  // Step 1.9
  it('should handle value containing equals sign', () => {
    expect(parsePrefs(['url=https://x.com?a=b'])).toEqual({
      url: 'https://x.com?a=b',
    });
  });

  // Step 1.10
  it('should skip malformed entries', () => {
    expect(parsePrefs(['malformed', 'valid=value'])).toEqual({ valid: 'value' });
  });

  // Step 1.11
  it('should handle empty value as empty string', () => {
    expect(parsePrefs(['some.pref='])).toEqual({ 'some.pref': '' });
  });

  // Multiple prefs
  it('should parse multiple preferences', () => {
    expect(
      parsePrefs([
        'bool.pref=true',
        'int.pref=42',
        'string.pref=hello',
      ])
    ).toEqual({
      'bool.pref': true,
      'int.pref': 42,
      'string.pref': 'hello',
    });
  });
});

describe('CLI --pref option', () => {
  // Step 2.1
  it('should accept --pref argument', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--pref', 'test=value']);
    expect(args.pref).toContain('test=value');
  });

  // Step 2.2
  it('should accept -p alias', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '-p', 'test=value']);
    expect(args.pref).toBeDefined();
    expect(args.pref).toContain('test=value');
  });

  // Multiple prefs via CLI
  it('should accept multiple --pref arguments', () => {
    const args = parseArguments('1.0.0', [
      'node',
      'script',
      '--pref',
      'pref1=value1',
      '--pref',
      'pref2=value2',
    ]);
    expect(args.pref).toContain('pref1=value1');
    expect(args.pref).toContain('pref2=value2');
  });
});
