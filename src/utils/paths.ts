/**
 * Filesystem layout for the data this server keeps under the user's home.
 *
 * Defined in one place so that the directory tools may write to (`output`) and
 * the directories the server and Firefox read back (profiles, `instances`,
 * `logs`) cannot drift into one another.
 */

import { createHash } from 'node:crypto';
import { existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { log } from './logger.js';

function currentRoot(): string {
  return join(homedir(), '.firefox-mcp');
}

/**
 * Data root used before the rename to firefox-mcp. Firefox Nightly still writes
 * Marionette port files to its `instances` folder.
 */
export function legacyHomeRoot(): string {
  return join(homedir(), '.firefox-devtools-mcp');
}

/**
 * Root of the server's own data. Not writable through `saveTo` as a whole.
 * Stays on the legacy root while `migrateHomeRoot` has not moved it.
 */
export function homeRoot(): string {
  const root = currentRoot();
  if (!existsSync(root) && existsSync(legacyHomeRoot())) {
    return legacyHomeRoot();
  }
  return root;
}

/**
 * Moves the legacy data root to its current name. When the move fails, for
 * example on Windows while Firefox holds a file open, the legacy root stays in
 * use and the move is tried again on the next start.
 */
export function migrateHomeRoot(): void {
  const root = currentRoot();
  const legacyRoot = legacyHomeRoot();
  if (existsSync(root) || !existsSync(legacyRoot)) {
    return;
  }
  try {
    renameSync(legacyRoot, root);
    log(`Moved ${legacyRoot} to ${root}`);
  } catch (error) {
    log(
      `Could not move ${legacyRoot} to ${root}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Destination for generated `saveTo` files. */
export function outputDir(): string {
  return join(homeRoot(), 'output');
}

/** Firefox stdout/stderr capture, read back by get_firefox_output. */
export function logsDir(): string {
  return join(homeRoot(), 'logs');
}

/** `<pid>.port` files used to look up the Marionette port. */
export function instancesDir(): string {
  return join(homeRoot(), 'instances');
}

/** Every folder that may hold `<pid>.port` files, including the legacy one Firefox writes to. */
export function instancesDirs(): string[] {
  const legacyDir = join(legacyHomeRoot(), 'instances');
  return instancesDir() === legacyDir ? [legacyDir] : [instancesDir(), legacyDir];
}

/**
 * Parent directory of the profile used in --auto-profile mode.
 * When a Firefox binary path is given, a short hash of that path is appended
 * so that different builds (Release, Nightly, …) each get their own profile.
 */
export function defaultProfileDir(firefoxPath?: string): string {
  if (!firefoxPath) {
    return join(homeRoot(), 'profile');
  }
  const hash = createHash('sha1').update(firefoxPath).digest('hex').slice(0, 8);
  return join(homeRoot(), `profile-${hash}`);
}
