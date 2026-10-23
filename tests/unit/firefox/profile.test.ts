/**
 * Unit tests for profile path resolution
 */

import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  log: vi.fn(),
  logDebug: vi.fn(),
}));

import * as fs from 'node:fs';
import {
  resolveProfilePath,
  isFirefoxProfile,
  MCP_PROFILE_DIR_NAME,
  MCP_PROFILE_MARKER,
} from '@/firefox/profile.js';
import { log } from '@/utils/logger.js';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockCopyFileSync = vi.mocked(fs.copyFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);

describe('isFirefoxProfile', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('returns false when directory has no Firefox profile indicators', () => {
    mockExistsSync.mockReturnValue(false);
    expect(isFirefoxProfile('/some/random/dir')).toBe(false);
  });

  it('returns true when prefs.js is present', () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('prefs.js'));
    expect(isFirefoxProfile('/real/profile')).toBe(true);
  });

  it('returns true when places.sqlite is present', () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('places.sqlite'));
    expect(isFirefoxProfile('/real/profile')).toBe(true);
  });
});

describe('resolveProfilePath', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockCopyFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it('returns the MCP subfolder path', () => {
    mockExistsSync.mockReturnValue(false);
    const result = resolveProfilePath('/custom/profiles');
    expect(result.path).toBe(join('/custom/profiles', MCP_PROFILE_DIR_NAME));
  });

  it('returns null warning for a non-Firefox directory', () => {
    mockExistsSync.mockReturnValue(false);
    const result = resolveProfilePath('/custom/profiles');
    expect(result.warning).toBeNull();
  });

  it('returns a warning when the parent looks like a real Firefox profile', () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('prefs.js'));
    const result = resolveProfilePath('/real/profile');
    expect(result.warning).toMatch(/looks like an existing Firefox profile/);
  });

  it('creates the MCP subfolder when it does not exist yet', () => {
    mockExistsSync.mockReturnValue(false);
    resolveProfilePath('/custom/profiles');
    expect(mockMkdirSync).toHaveBeenCalledWith(join('/custom/profiles', MCP_PROFILE_DIR_NAME), {
      recursive: true,
    });
  });

  it('does not create the directory when it already exists', () => {
    // Simulate: no profile indicators in parent, but MCP subfolder already exists.
    mockExistsSync.mockImplementation(
      (p: unknown) => String(p) === join('/custom/profiles', MCP_PROFILE_DIR_NAME)
    );
    resolveProfilePath('/custom/profiles');
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('copies prefs.js from parent on first creation when present', () => {
    // Parent has prefs.js (indicator + copy source), MCP subfolder does not exist yet.
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // Return true for prefs.js indicator AND for the parent prefs.js source,
      // but false for the MCP subfolder itself (isNew = true).
      return path.endsWith('prefs.js') && !path.includes(MCP_PROFILE_DIR_NAME);
    });
    resolveProfilePath('/real/profile');
    expect(mockCopyFileSync).toHaveBeenCalledWith(
      join('/real/profile', 'prefs.js'),
      join('/real/profile', MCP_PROFILE_DIR_NAME, 'prefs.js')
    );
  });

  it('does not copy prefs.js when parent has no prefs.js', () => {
    mockExistsSync.mockReturnValue(false);
    resolveProfilePath('/custom/profiles');
    expect(mockCopyFileSync).not.toHaveBeenCalled();
  });

  it('does not copy prefs.js when MCP subfolder already existed', () => {
    // Both MCP subfolder and parent prefs.js exist — not a new profile.
    mockExistsSync.mockReturnValue(true);
    resolveProfilePath('/real/profile');
    expect(mockCopyFileSync).not.toHaveBeenCalled();
  });

  it('marks a newly created MCP profile', () => {
    mockExistsSync.mockReturnValue(false);
    resolveProfilePath('/custom/profiles');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      join('/custom/profiles', MCP_PROFILE_DIR_NAME, MCP_PROFILE_MARKER),
      ''
    );
  });

  it('marks an existing MCP subfolder that has no marker yet', () => {
    mockExistsSync.mockImplementation(
      (p: unknown) => String(p) === join('/custom/profiles', MCP_PROFILE_DIR_NAME)
    );
    resolveProfilePath('/custom/profiles');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      join('/custom/profiles', MCP_PROFILE_DIR_NAME, MCP_PROFILE_MARKER),
      ''
    );
  });

  it('logs a marker write failure without preventing profile resolution', () => {
    const error = new Error('permission denied');
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw error;
    });

    const result = resolveProfilePath('/custom/profiles');

    expect(result.path).toBe(join('/custom/profiles', MCP_PROFILE_DIR_NAME));
    expect(log).toHaveBeenCalledWith(
      `Could not write MCP profile marker at ${join('/custom/profiles', MCP_PROFILE_DIR_NAME, MCP_PROFILE_MARKER)}: permission denied`
    );
  });

  it('reuses a marked MCP profile passed directly, without nesting or warning', () => {
    const marked = join('/custom/profiles', MCP_PROFILE_DIR_NAME);
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path === join(marked, MCP_PROFILE_MARKER) || path === join(marked, 'prefs.js');
    });
    const result = resolveProfilePath(marked);
    expect(result).toEqual({ path: marked, warning: null });
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
