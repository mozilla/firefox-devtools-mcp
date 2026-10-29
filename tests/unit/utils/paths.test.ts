/**
 * Tests for the filesystem layout helpers
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeDir } from '../../helpers/fs.js';

const MOCK_HOME = join(tmpdir(), `paths-test-home-${process.pid}`);

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

import {
  defaultProfileDir,
  homeRoot,
  instancesDir,
  instancesDirs,
  logsDir,
  migrateHomeRoot,
  outputDir,
} from '../../../src/utils/paths.js';

const base = join(MOCK_HOME, '.firefox-mcp');
const legacy = join(MOCK_HOME, '.firefox-devtools-mcp');

describe('layout', () => {
  it('places every directory under the home root', () => {
    expect(homeRoot()).toBe(base);
    expect(outputDir()).toBe(join(base, 'output'));
    expect(logsDir()).toBe(join(base, 'logs'));
    expect(instancesDir()).toBe(join(base, 'instances'));
  });

  it('keeps saveTo output apart from the paths the server reads back', () => {
    // saveTo writes into output/; anything the server or Firefox reads must sit
    // outside it, so that writable output cannot reach it.
    const readBack = [logsDir(), instancesDir(), defaultProfileDir(), defaultProfileDir('/bin/fx')];
    for (const path of readBack) {
      expect(path.startsWith(`${outputDir()}${sep}`)).toBe(false);
      expect(path).not.toBe(outputDir());
    }
  });
});

describe('defaultProfileDir', () => {
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

describe('migrateHomeRoot', () => {
  afterEach(() => {
    if (existsSync(MOCK_HOME)) {
      chmodSync(MOCK_HOME, 0o700);
      removeDir(MOCK_HOME);
    }
  });

  it('moves the legacy data root with its content', () => {
    mkdirSync(join(legacy, 'profile'), { recursive: true });
    writeFileSync(join(legacy, 'profile', 'prefs.js'), '');
    expect(homeRoot()).toBe(legacy);

    migrateHomeRoot();

    expect(homeRoot()).toBe(base);
    expect(existsSync(join(base, 'profile', 'prefs.js'))).toBe(true);
    expect(existsSync(legacy)).toBe(false);
  });

  it('leaves the legacy data root alone once the current one exists', () => {
    mkdirSync(legacy, { recursive: true });
    mkdirSync(base, { recursive: true });

    migrateHomeRoot();

    expect(homeRoot()).toBe(base);
    expect(existsSync(legacy)).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps using the legacy data root when the move fails',
    () => {
      mkdirSync(legacy, { recursive: true });
      chmodSync(MOCK_HOME, 0o500);

      migrateHomeRoot();

      expect(homeRoot()).toBe(legacy);
      expect(existsSync(base)).toBe(false);
    }
  );

  it('looks for port files in the legacy instances folder as well', () => {
    mkdirSync(base, { recursive: true });
    expect(instancesDirs()).toEqual([join(base, 'instances'), join(legacy, 'instances')]);
  });
});
