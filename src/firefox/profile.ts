/**
 * Profile path resolution for Firefox DevTools MCP
 *
 * Rather than using a user-provided path directly as the Firefox profile,
 * we create a dedicated subfolder. This prevents accidentally reusing a real
 * browser profile (with bookmarks, saved passwords, cookies, …) inside an
 * automated/remote-accessible session.
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../utils/logger.js';

export const MCP_PROFILE_DIR_NAME = 'firefox_devtools_mcp_profile';

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

export interface ResolvedProfile {
  path: string;
  /** Warning to surface to the user (e.g. when a real Firefox profile was detected). */
  warning: string | null;
}

/**
 * Resolves a user-supplied profile path to a safe, MCP-specific subfolder.
 *
 * Given `parentPath`, the function:
 * 1. Appends `firefox_devtools_mcp_profile` to form the real profile path.
 * 2. Warns when `parentPath` itself looks like a real Firefox profile.
 * 3. Creates the subfolder on first use.
 * 4. On first creation, copies `prefs.js` from the parent into the new profile
 *    so that user preferences carry over (browser_toolbox-style bootstrap).
 *
 * @returns The resolved path and an optional warning string.
 */
export function resolveProfilePath(parentPath: string): ResolvedProfile {
  const mcpProfilePath = join(parentPath, MCP_PROFILE_DIR_NAME);

  let warning: string | null = null;
  if (isFirefoxProfile(parentPath)) {
    warning =
      `⚠️  The path "${parentPath}" looks like an existing Firefox profile.\n` +
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
    log(`📁 Created MCP profile directory: ${mcpProfilePath}`);

    // Bootstrap: copy prefs.js from the parent so user preferences are preserved.
    const parentPrefs = join(parentPath, 'prefs.js');
    if (existsSync(parentPrefs)) {
      copyFileSync(parentPrefs, join(mcpProfilePath, 'prefs.js'));
      log(`   Copied prefs.js from parent profile for initial preferences.`);
    }
  }

  return { path: mcpProfilePath, warning };
}
