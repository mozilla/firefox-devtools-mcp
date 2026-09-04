/**
 * CLI argument parsing for Firefox DevTools MCP server
 */

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Options as YargsOptions } from 'yargs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MODULE_NAMES, PRESET_NAMES } from './tools/index.js';

/**
 * Parsed preference value (boolean, integer, or string)
 */
export type PrefValue = string | number | boolean;

/**
 * Returns the default profile parent directory for --auto-profile mode.
 * When a Firefox binary path is given, a short hash of that path is appended
 * so that different builds (Release, Nightly, …) each get their own profile.
 */
export function defaultProfileDir(firefoxPath?: string): string {
  const base = join(homedir(), '.firefox-devtools-mcp');
  if (!firefoxPath) {
    return join(base, 'profile');
  }
  const hash = createHash('sha1').update(firefoxPath).digest('hex').slice(0, 8);
  return join(base, `profile-${hash}`);
}

/**
 * Parse preference strings into typed values
 * Format: "name=value" where value is auto-typed as boolean/integer/string
 */
export function parsePrefs(prefs: string[] | undefined): Record<string, PrefValue> {
  const result: Record<string, PrefValue> = {};

  if (!prefs || prefs.length === 0) {
    return result;
  }

  for (const pref of prefs) {
    const eqIndex = pref.indexOf('=');
    if (eqIndex === -1) {
      // Skip malformed entries (no equals sign)
      continue;
    }

    const name = pref.slice(0, eqIndex);
    const rawValue = pref.slice(eqIndex + 1);

    // Type inference
    let value: PrefValue;
    if (rawValue === 'true') {
      value = true;
    } else if (rawValue === 'false') {
      value = false;
    } else if (/^-?\d+$/.test(rawValue)) {
      value = parseInt(rawValue, 10);
    } else {
      value = rawValue;
    }

    result[name] = value;
  }

  return result;
}

export const cliOptions = {
  firefoxPath: {
    type: 'string',
    description: 'Path to Firefox executable (optional, uses system Firefox if not specified)',
    alias: 'f',
  },
  headless: {
    type: 'boolean',
    description: 'Whether to run Firefox in headless (no UI) mode',
    default: (process.env.FIREFOX_HEADLESS ?? 'false') === 'true',
  },
  viewport: {
    type: 'string',
    description:
      'Initial viewport size for Firefox instances. For example, `1280x720`. In headless mode, max size is 3840x2160px.',
    coerce: (arg: string | undefined) => {
      if (arg === undefined) {
        return;
      }
      const [width, height] = arg.split('x').map(Number);
      if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error('Invalid viewport. Expected format is `1280x720`.');
      }
      return {
        width,
        height,
      };
    },
  },
  acceptInsecureCerts: {
    type: 'boolean',
    description:
      'If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.',
    default: (process.env.ACCEPT_INSECURE_CERTS ?? 'false') === 'true',
  },
  profilePath: {
    type: 'string',
    description: 'Path to Firefox profile directory (optional, for persistent profile)',
  },
  autoProfile: {
    type: 'boolean',
    description:
      'Automatically use a persistent profile stored in ~/.firefox-devtools-mcp/. ' +
      'When --firefox-path is set, the profile is scoped to that binary so different ' +
      'Firefox builds stay isolated.',
    default: (process.env.AUTO_PROFILE ?? 'false') === 'true',
  },
  firefoxArg: {
    type: 'array',
    description:
      'Additional arguments for Firefox. Only applies when Firefox is launched by firefox-devtools-mcp.',
  },
  startUrl: {
    type: 'string',
    description: 'URL to open when Firefox starts (default: about:blank)',
    default: process.env.START_URL ?? 'about:blank',
  },
  connectExisting: {
    type: 'boolean',
    description:
      'Connect to an already-running Firefox instance via Marionette instead of launching a new one. Firefox must be started with both --marionette and --remote-debugging-port.',
    default: (process.env.CONNECT_EXISTING ?? 'false') === 'true',
  },
  marionettePort: {
    type: 'number',
    description: 'Marionette port to connect to when using --connect-existing (default: 2828)',
    default: Number(process.env.MARIONETTE_PORT ?? '2828'),
  },
  lookupMarionettePort: {
    type: 'boolean',
    hidden: true,
    description:
      "Lookup the port of a Marionette instance started by Firefox's AI assistant " +
      'companion, instead of using --marionette-port. Only applies when --connect-existing is set.',
    default: (process.env.LOOKUP_MARIONETTE_PORT ?? 'false') === 'true',
  },
  env: {
    type: 'array',
    description:
      'Environment variables for Firefox in KEY=VALUE format. Can be specified multiple times. Example: --env MOZ_LOG=HTMLMediaElement:4',
  },
  outputFile: {
    type: 'string',
    description:
      'Path to file where Firefox output (stdout/stderr) will be written. If not specified, output is written to ~/.firefox-devtools-mcp/output/',
  },
  pref: {
    type: 'array',
    string: true,
    description:
      'Set Firefox preference at startup via moz:firefoxOptions (format: name=value). Can be specified multiple times.',
    alias: 'p',
  },
  androidDevice: {
    type: 'string',
    description:
      'Android device serial for launching Firefox for Android via ADB. Omit to auto-select the single connected device. Requires adb on PATH.',
  },
  androidPackage: {
    type: 'string',
    description:
      'Android app package name (default: org.mozilla.firefox). Use org.mozilla.fenix for Nightly.',
    default: process.env.ANDROID_PACKAGE ?? 'org.mozilla.firefox',
  },
  androidWipeAppData: {
    type: 'boolean',
    description:
      'Confirm that connecting to Firefox for Android wipes all data of the target app (tabs, ' +
      'history, bookmarks, passwords, settings). Required with --android-device.',
    default: (process.env.ANDROID_WIPE_APP_DATA ?? 'false') === 'true',
  },
  logFile: {
    type: 'string',
    description:
      'Path to a file where MCP server logs will be written. Set DEBUG=* to also enable verbose debug logs.',
  },
  allowSystemAccess: {
    type: 'boolean',
    description:
      'Allow privileged Firefox access. Use with --tool-preset mozilla or an explicit privileged tool selection.',
    default: false,
  },
  tools: {
    type: 'array',
    string: true,
    description:
      'Explicit list of tool modules to enable, e.g. --tools pages network script. Overrides --tool-preset entirely. ' +
      `Available modules: ${MODULE_NAMES.join(', ')}.`,
    coerce: (arg: string[] | undefined) => {
      if (arg === undefined) {
        return undefined;
      }
      // Allow both repeated flags and comma-separated values.
      return arg
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    },
  },
  toolPreset: {
    type: 'string',
    description:
      `Preset selecting which tool modules to enable: ${PRESET_NAMES.join(' < ')}. ` +
      'Ignored when --tools is given. Privileged modules (mozilla/all) require --allow-system-access.',
    default: process.env.TOOL_PRESET || 'basic',
  },
  enableScript: {
    type: 'boolean',
    description:
      'Deprecated: use --tools/--tool-preset. Enable the script and debugging tools (Firefox 153+ required).',
    default: (process.env.ENABLE_SCRIPT ?? 'false') === 'true',
  },
  enablePrivilegedContext: {
    type: 'boolean',
    description:
      'Deprecated: use --tools/--tool-preset. Enable privileged context tools and Firefox prefs tools. Requires --allow-system-access.',
    default: (process.env.ENABLE_PRIVILEGED_CONTEXT ?? 'false') === 'true',
  },
  unrestrictedSavePaths: {
    type: 'boolean',
    description:
      'Allow tools that save files (e.g. screenshots, snapshots, network/console output) to write to arbitrary locations. By default, relative save paths resolve against the current working directory and absolute save paths are restricted to ~/.firefox-devtools-mcp; this flag lifts both restrictions. Use with caution.',
    default: (process.env.UNRESTRICTED_SAVE_PATHS ?? 'false') === 'true',
  },
  disableNetworkBodyCollection: {
    type: 'boolean',
    hidden: true,
    description:
      'Disable capturing network request/response bodies via BiDi data collectors. get_network_request will still return metadata and headers but no bodies. Reduces browser memory and stream-cloning overhead.',
    default: (process.env.DISABLE_NETWORK_BODY_COLLECTION ?? 'false') === 'true',
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv, includePrivileged = true) {
  const { enablePrivilegedContext: _, ...rest } = cliOptions;
  const options = includePrivileged ? cliOptions : rest;
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx firefox-devtools-mcp@latest')
    .options(options)
    .example([
      [
        '$0 --firefox-path /Applications/Firefox.app/Contents/MacOS/firefox',
        'Use specific Firefox',
      ],
      ['$0 --headless', 'Run Firefox in headless mode'],
      ['$0 --viewport 1280x720', 'Launch Firefox with viewport size of 1280x720px'],
      ['$0 --help', 'Print CLI options'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
