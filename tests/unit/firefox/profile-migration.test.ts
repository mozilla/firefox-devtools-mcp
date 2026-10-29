/**
 * Profile resolution with the names used before the rename to firefox-mcp
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveProfilePath } from '@/firefox/profile.js';
import { removeDir } from '../../helpers/fs.js';

describe('resolveProfilePath with legacy names', () => {
  let parent: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'profile-migration-'));
  });

  afterEach(() => {
    removeDir(parent);
  });

  it('renames a legacy profile folder and marks it with the current marker', () => {
    const legacyProfile = join(parent, 'firefox_devtools_mcp_profile');
    mkdirSync(legacyProfile);
    writeFileSync(join(legacyProfile, '.firefox-devtools-mcp'), '');
    writeFileSync(join(legacyProfile, 'places.sqlite'), '');

    const { path } = resolveProfilePath(parent);

    expect(path).toBe(join(parent, 'firefox_mcp_profile'));
    expect(existsSync(join(path, 'places.sqlite'))).toBe(true);
    expect(existsSync(join(path, '.firefox-mcp'))).toBe(true);
    expect(existsSync(legacyProfile)).toBe(false);
  });

  it('reuses a profile marked with the legacy marker directly', () => {
    writeFileSync(join(parent, '.firefox-devtools-mcp'), '');

    expect(resolveProfilePath(parent).path).toBe(parent);
  });
});
