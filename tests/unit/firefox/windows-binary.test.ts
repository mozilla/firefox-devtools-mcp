import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { win32 as windowsPath } from 'node:path';

import { findFirefoxBinaryWindows, parseRegQueryOutput } from '@/firefox/windows-binary.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(), statSync: vi.fn() };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});

const { existsSync, statSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');

const mockExists = vi.mocked(existsSync);
const mockStat = vi.mocked(statSync);
const mockExec = vi.mocked(execFileSync);

/** Pretend only the listed paths exist as regular files. */
function presentFiles(...paths: string[]): void {
  const present = new Set(paths);
  mockExists.mockImplementation((p) => present.has(String(p)));
  mockStat.mockImplementation(
    (p) => ({ isFile: () => present.has(String(p)) }) as ReturnType<typeof statSync>
  );
}

describe('parseRegQueryOutput', () => {
  it('extracts the default value from reg query output', () => {
    const output = [
      '',
      'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\firefox.exe',
      '    (Default)    REG_SZ    C:\\Users\\me\\AppData\\Local\\Mozilla Firefox\\firefox.exe',
      '',
    ].join('\r\n');

    expect(parseRegQueryOutput(output)).toBe(
      'C:\\Users\\me\\AppData\\Local\\Mozilla Firefox\\firefox.exe'
    );
  });

  it('handles a localised value name, since only the type tag is stable', () => {
    const output = '    (Standard)    REG_SZ    C:\\Firefox\\firefox.exe';
    expect(parseRegQueryOutput(output)).toBe('C:\\Firefox\\firefox.exe');
  });

  it('accepts REG_EXPAND_SZ values', () => {
    const output = '    (Default)    REG_EXPAND_SZ    C:\\Firefox\\firefox.exe';
    expect(parseRegQueryOutput(output)).toBe('C:\\Firefox\\firefox.exe');
  });

  it('returns null when the key holds no value', () => {
    expect(parseRegQueryOutput('ERROR: The system was unable to find the key.')).toBeNull();
  });
});

describe('findFirefoxBinaryWindows', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...env };
    delete process.env.ProgramFiles;
    delete process.env.ProgramW6432;
    delete process.env['ProgramFiles(x86)'];
    delete process.env.LOCALAPPDATA;
    // Set explicitly: the real process.env is case-insensitive on Windows (the
    // key is SYSTEMROOT), but the plain object above is not.
    process.env.SystemRoot = 'C:\\Windows';
    process.env.PATH = '';
    mockExec.mockImplementation(() => {
      throw new Error('key not found');
    });
    presentFiles();
  });

  afterEach(() => {
    process.env = env;
  });

  it('finds a machine-wide install under Program Files', () => {
    process.env.ProgramFiles = 'C:\\Program Files';
    const expected = windowsPath.join('C:\\Program Files', 'Mozilla Firefox', 'firefox.exe');
    presentFiles(expected);

    expect(findFirefoxBinaryWindows()).toBe(expected);
  });

  it('finds a per-user install under LOCALAPPDATA — the case geckodriver misses', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\me\\AppData\\Local';
    const expected = windowsPath.join(
      'C:\\Users\\me\\AppData\\Local',
      'Mozilla Firefox',
      'firefox.exe'
    );
    presentFiles(expected);

    expect(findFirefoxBinaryWindows()).toBe(expected);
  });

  it('prefers Program Files over LOCALAPPDATA so working setups keep their binary', () => {
    process.env.ProgramFiles = 'C:\\Program Files';
    process.env.LOCALAPPDATA = 'C:\\Users\\me\\AppData\\Local';
    const programFiles = windowsPath.join('C:\\Program Files', 'Mozilla Firefox', 'firefox.exe');
    presentFiles(
      programFiles,
      windowsPath.join('C:\\Users\\me\\AppData\\Local', 'Mozilla Firefox', 'firefox.exe')
    );

    expect(findFirefoxBinaryWindows()).toBe(programFiles);
  });

  it('falls back to firefox.exe on PATH', () => {
    process.env.PATH = ['C:\\nowhere', 'C:\\tools\\firefox'].join(';');
    const expected = windowsPath.join('C:\\tools\\firefox', 'firefox.exe');
    presentFiles(expected);

    expect(findFirefoxBinaryWindows()).toBe(expected);
  });

  it('falls back to the registry when nothing is in a predictable location', () => {
    const registryPath = 'D:\\Custom\\Firefox\\firefox.exe';
    presentFiles(registryPath);
    mockExec.mockReturnValue(`    (Default)    REG_SZ    ${registryPath}\r\n` as never);

    expect(findFirefoxBinaryWindows()).toBe(registryPath);
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('reg.exe'),
      expect.arrayContaining(['query', expect.stringContaining('HKCU'), '/ve']),
      expect.anything()
    );
  });

  it('invokes reg.exe by absolute path, so an empty PATH cannot break the fallback', () => {
    process.env.SystemRoot = 'C:\\Windows';
    const registryPath = 'D:\\Custom\\Firefox\\firefox.exe';
    presentFiles(registryPath);
    mockExec.mockReturnValue(`    (Default)    REG_SZ    ${registryPath}\r\n` as never);

    expect(findFirefoxBinaryWindows()).toBe(registryPath);
    expect(mockExec).toHaveBeenCalledWith(
      windowsPath.join('C:\\Windows', 'System32', 'reg.exe'),
      expect.anything(),
      expect.anything()
    );
  });

  it('ignores a registry path that no longer exists on disk', () => {
    presentFiles();
    mockExec.mockReturnValue('    (Default)    REG_SZ    D:\\Gone\\firefox.exe\r\n' as never);

    expect(findFirefoxBinaryWindows()).toBeNull();
  });

  it('returns null when Firefox is nowhere to be found', () => {
    expect(findFirefoxBinaryWindows()).toBeNull();
  });
});
