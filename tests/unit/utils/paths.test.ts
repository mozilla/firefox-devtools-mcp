/**
 * Tests for the filesystem layout helpers
 */

import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  defaultProfileDir,
  homeRoot,
  instancesDir,
  logsDir,
  outputDir,
} from '../../../src/utils/paths.js';

const base = join(homedir(), '.firefox-devtools-mcp');

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
