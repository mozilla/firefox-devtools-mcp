/**
 * Tests for preference parsing (parsePrefs function) and CLI --pref option
 */

import { describe, it, expect } from 'vitest';
import { parsePrefs, parseArguments } from '../../src/cli.js';

describe('parsePrefs', () => {
  it('should return empty object for undefined input', () => {
    expect(parsePrefs(undefined)).toEqual({});
  });

  it('should return empty object for empty array', () => {
    expect(parsePrefs([])).toEqual({});
  });

  it('should parse simple string preference', () => {
    expect(parsePrefs(['some.pref=value'])).toEqual({ 'some.pref': 'value' });
  });

  it('should parse boolean true', () => {
    expect(parsePrefs(['some.pref=true'])).toEqual({ 'some.pref': true });
  });

  it('should parse boolean false', () => {
    expect(parsePrefs(['some.pref=false'])).toEqual({ 'some.pref': false });
  });

  it('should parse integer', () => {
    expect(parsePrefs(['some.pref=42'])).toEqual({ 'some.pref': 42 });
  });

  it('should parse negative integer', () => {
    expect(parsePrefs(['some.pref=-5'])).toEqual({ 'some.pref': -5 });
  });

  it('should keep float as string (Firefox has no float pref)', () => {
    expect(parsePrefs(['some.pref=3.14'])).toEqual({ 'some.pref': '3.14' });
  });

  it('should handle value containing equals sign', () => {
    expect(parsePrefs(['url=https://x.com?a=b'])).toEqual({
      url: 'https://x.com?a=b',
    });
  });

  it('should skip malformed entries', () => {
    expect(parsePrefs(['malformed', 'valid=value'])).toEqual({ valid: 'value' });
  });

  it('should handle empty value as empty string', () => {
    expect(parsePrefs(['some.pref='])).toEqual({ 'some.pref': '' });
  });

  // Multiple prefs
  it('should parse multiple preferences', () => {
    expect(parsePrefs(['bool.pref=true', 'int.pref=42', 'string.pref=hello'])).toEqual({
      'bool.pref': true,
      'int.pref': 42,
      'string.pref': 'hello',
    });
  });
});

describe('CLI --enable-script flag', () => {
  it('should default to false', () => {
    const args = parseArguments('1.0.0', ['node', 'script']);
    expect(args.enableScript).toBe(false);
  });

  it('should be true when --enable-script is passed', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--enable-script']);
    expect(args.enableScript).toBe(true);
  });
});

describe('CLI --enable-privileged-context flag', () => {
  it('should default to false', () => {
    const args = parseArguments('1.0.0', ['node', 'script']);
    expect(args.enablePrivilegedContext).toBe(false);
  });

  it('should be true when --enable-privileged-context is passed', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--enable-privileged-context']);
    expect(args.enablePrivilegedContext).toBe(true);
  });
});

describe('CLI --pref option', () => {
  it('should accept --pref argument', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--pref', 'test=value']);
    expect(args.pref).toContain('test=value');
  });

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
