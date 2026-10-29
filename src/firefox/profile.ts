/**
 * Profile path resolution for Firefox DevTools MCP
 *
 * Unmarked user supplied paths use a dedicated subfolder to avoid reusing a
 * real browser profile in an automated session. Marked MCP profiles can be
 * used directly when passed as the profile path.
 */

import { existsSync, mkdirSync, copyFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../utils/logger.js';

export const MCP_PROFILE_DIR_NAME = 'firefox_mcp_profile';

export const MCP_PROFILE_MARKER = '.firefox-mcp';

// Names used before the rename to firefox-mcp.
const LEGACY_MCP_PROFILE_DIR_NAME = 'firefox_devtools_mcp_profile';
const LEGACY_MCP_PROFILE_MARKER = '.firefox-devtools-mcp';

/**
 * Files that are characteristic of an existing Firefox profile directory.
 * Their presence indicates the user may have pointed at their real profile.
 */
const FIREFOX_PROFILE_INDICATORS = ['prefs.js', 'places.sqlite', 'cert9.db', 'key4.db'];

/**
 * Returns true when the given directory looks like an existing Firefox profile.
 */
export function isFirefoxProfile(dir: string): boolean {
  return FIREFOX_PROFILE_INDICATORS.some((file) => existsSync(join(dir, file)));
}

export function isMcpProfile(dir: string): boolean {
  return (
    existsSync(join(dir, MCP_PROFILE_MARKER)) || existsSync(join(dir, LEGACY_MCP_PROFILE_MARKER))
  );
}

/**
 * Returns the MCP profile folder inside `parentPath`, after renaming a legacy
 * one. When the rename fails, the legacy folder stays in use.
 */
function mcpProfileDir(parentPath: string): string {
  const path = join(parentPath, MCP_PROFILE_DIR_NAME);
  const legacyPath = join(parentPath, LEGACY_MCP_PROFILE_DIR_NAME);
  if (existsSync(path) || !existsSync(legacyPath)) {
    return path;
  }
  try {
    renameSync(legacyPath, path);
    log(`Moved MCP profile ${legacyPath} to ${path}`);
    return path;
  } catch (error) {
    log(
      `Could not move MCP profile ${legacyPath} to ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
    return legacyPath;
  }
}

export interface ResolvedProfile {
  path: string;
  /** Warning to surface to the user (e.g. when a real Firefox profile was detected). */
  warning: string | null;
}

/**
 * Resolves the profile path Firefox should use.
 *
 * Given `parentPath`, the function:
 * 1. Returns `parentPath` unchanged when it is a marked MCP profile.
 * 2. Otherwise appends `firefox_mcp_profile` to form the profile path, after
 *    renaming a legacy `firefox_devtools_mcp_profile` folder.
 * 3. Warns when `parentPath` itself looks like a real Firefox profile.
 * 4. Creates the subfolder on first use.
 * 5. On first creation, copies `prefs.js` from the parent into the new profile
 *    so that user preferences carry over (browser_toolbox-style bootstrap).
 * 6. Attempts to write the marker for future direct reuse. Failures are logged.
 *
 * @returns The resolved path and an optional warning string.
 */
export function resolveProfilePath(parentPath: string): ResolvedProfile {
  if (isMcpProfile(parentPath)) {
    return { path: parentPath, warning: null };
  }

  const mcpProfilePath = mcpProfileDir(parentPath);

  let warning: string | null = null;
  if (isFirefoxProfile(parentPath)) {
    warning =
      `Warning: The path "${parentPath}" looks like an existing Firefox profile.\n` +
      `   It will NOT be used directly. Instead, a dedicated MCP profile will be\n` +
      `   created at: ${mcpProfilePath}\n` +
      `   This keeps your real profile safe from automated browser access.\n` +
      `   If you want to connect to your real profile, start Firefox yourself with\n` +
      `   --remote-debugging-port and use --connect-existing instead.`;
    log(warning);
  }

  const isNew = !existsSync(mcpProfilePath);

  if (isNew) {
    mkdirSync(mcpProfilePath, { recursive: true });
    log(`Created MCP profile directory: ${mcpProfilePath}`);

    // Bootstrap: copy prefs.js from the parent so user preferences are preserved.
    const parentPrefs = join(parentPath, 'prefs.js');
    if (existsSync(parentPrefs)) {
      copyFileSync(parentPrefs, join(mcpProfilePath, 'prefs.js'));
      log(`   Copied prefs.js from parent profile for initial preferences.`);
    }
  }

  const markerPath = join(mcpProfilePath, MCP_PROFILE_MARKER);
  if (!existsSync(markerPath)) {
    try {
      writeFileSync(markerPath, '');
    } catch (error) {
      log(
        `Could not write MCP profile marker at ${markerPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { path: mcpProfilePath, warning };
}
