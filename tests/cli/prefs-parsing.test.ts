/**
 * Tests for preference parsing (parsePrefs function) and CLI --pref option
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { parsePrefs, parseArguments, defaultProfileDir } from '../../src/cli.js';

describe('defaultProfileDir', () => {
  const base = join(homedir(), '.firefox-devtools-mcp');

  it('returns base profile dir when no firefox path given', () => {
    expect(defaultProfileDir()).toBe(join(base, 'profile'));
    expect(defaultProfileDir(undefined)).toBe(join(base, 'profile'));
  });

  it('appends an 8-char hash of the binary path', () => {
    const binaryPath = '/Applications/Firefox.app/Contents/MacOS/firefox';
    const hash = createHash('sha1').update(binaryPath).digest('hex').slice(0, 8);
    expect(defaultProfileDir(binaryPath)).toBe(join(base, `profile-${hash}`));
  });

  it('produces different dirs for different binaries', () => {
    const release = defaultProfileDir('/usr/bin/firefox');
    const nightly = defaultProfileDir('/opt/firefox-nightly/firefox');
    expect(release).not.toBe(nightly);
  });

  it('produces the same dir for the same binary path', () => {
    const path = '/usr/bin/firefox';
    expect(defaultProfileDir(path)).toBe(defaultProfileDir(path));
  });
});

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

describe('CLI --allow-system-access flag', () => {
  it('should default to false', () => {
    const args = parseArguments('1.0.0', ['node', 'script']);
    expect(args.allowSystemAccess).toBe(false);
  });

  it('should be true when --allow-system-access is passed', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--allow-system-access']);
    expect(args.allowSystemAccess).toBe(true);
  });

  it('should be available in the public option set', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--allow-system-access'], false);
    expect(args.allowSystemAccess).toBe(true);
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
