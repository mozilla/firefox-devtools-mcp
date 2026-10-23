/**
 * Unit tests for save-output when the working directory contains the server's
 * own data directory.
 *
 * The relative root is process.cwd(), chosen by whoever launches the server
 * rather than by the operator. A server started at / or at $HOME has
 * ~/.firefox-devtools-mcp inside its relative root, so confining absolute paths
 * to the output directory does not put the profile out of reach: a relative path
 * gets there without a single "..".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { join, relative } from 'node:path';

// A home directory inside the working directory, as seen by a server launched
// with its cwd above the user's home.
const MOCK_HOME = join(process.cwd(), `save-output-cwd-home-${process.pid}`);
const HOME_ROOT = join(MOCK_HOME, '.firefox-devtools-mcp');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

const mockArgs = vi.hoisted(() => ({
  unrestrictedSavePaths: false,
  profilePath: undefined as string | undefined,
  outputFile: undefined as string | undefined,
}));
vi.mock('../../../src/index.js', () => ({ args: mockArgs }));

import { saveOutput } from '../../../src/utils/save-output.js';

describe('saveOutput with the data directory inside the working directory', () => {
  beforeEach(() => {
    mockArgs.unrestrictedSavePaths = false;
    mockArgs.profilePath = undefined;
    mockArgs.outputFile = undefined;
  });

  afterEach(() => {
    if (existsSync(MOCK_HOME)) {
      removeDir(MOCK_HOME);
    }
  });

  const relativeToCwd = (...segments: string[]) => relative(process.cwd(), join(...segments));

  it('reaches the --auto-profile profile through a relative path', async () => {
    const userJs = join(HOME_ROOT, 'profile', 'firefox_devtools_mcp_profile', 'user.js');

    await expect(saveOutput('data', relativeToCwd(userJs), 'get-page-text', 'txt')).rejects.toThrow(
      'reads back'
    );
    expect(existsSync(userJs)).toBe(false);
  });

  it('reaches the instance port files and the captured output as well', async () => {
    for (const target of [
      join(HOME_ROOT, 'instances', '1234.port'),
      join(HOME_ROOT, 'logs', 'firefox-forged.log'),
    ]) {
      await expect(
        saveOutput('data', relativeToCwd(target), 'get-page-text', 'txt')
      ).rejects.toThrow('reads back');
      expect(existsSync(target)).toBe(false);
    }
  });

  it('refuses the profile of a Firefox binary this session does not use', async () => {
    // Running Release must not give write access to the Nightly profile: the
    // preferences planted there would apply to whoever runs Nightly next.
    const { defaultProfileDir } = await import('../../../src/utils/paths.js');
    const otherProfile = defaultProfileDir(
      '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'
    );
    const userJs = join(otherProfile, 'firefox_devtools_mcp_profile', 'user.js');

    await expect(saveOutput('data', relativeToCwd(userJs), 'get-page-text', 'txt')).rejects.toThrow(
      'reads back'
    );
    expect(existsSync(userJs)).toBe(false);
  });

  it('still allows the output directory itself', async () => {
    mkdirSync(join(HOME_ROOT, 'output'), { recursive: true });

    const saved = await saveOutput(
      'data',
      relativeToCwd(HOME_ROOT, 'output', 'snapshot.txt'),
      'take-snapshot',
      'txt'
    );
    expect(existsSync(saved.path)).toBe(true);
  });
});
