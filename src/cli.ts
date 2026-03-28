/**
 * CLI argument parsing for Firefox DevTools MCP server
 */

import type { Options as YargsOptions } from 'yargs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * Parsed preference value (boolean, integer, or string)
 */
export type PrefValue = string | number | boolean;

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
  firefoxArg: {
    type: 'array',
    description:
      'Additional arguments for Firefox. Only applies when Firefox is launched by firefox-devtools-mcp.',
  },
  startUrl: {
    type: 'string',
    description: 'URL to open when Firefox starts (default: about:home)',
    default: process.env.START_URL ?? 'about:home',
  },
  connectExisting: {
    type: 'boolean',
    description:
      'Connect to an already-running Firefox instance via Marionette instead of launching a new one. Requires Firefox to be running with marionette.enabled=true (set in user.js or launched with --marionette).',
    default: (process.env.CONNECT_EXISTING ?? 'false') === 'true',
  },
  marionettePort: {
    type: 'number',
    description: 'Marionette port to connect to when using --connect-existing (default: 2828)',
    default: Number(process.env.MARIONETTE_PORT ?? '2828'),
  },
  marionetteHost: {
    type: 'string',
    description: 'Marionette host to connect to when using --connect-existing (default: 127.0.0.1). Also used as the BiDi WebSocket connect address when different from 127.0.0.1.',
    default: process.env.MARIONETTE_HOST ?? '127.0.0.1',
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
  enableScript: {
    type: 'boolean',
    description:
      'Enable the evaluate_script tool, which allows executing arbitrary JavaScript in the page context.',
    default: (process.env.ENABLE_SCRIPT ?? 'false') === 'true',
  },
  enablePrivilegedContext: {
    type: 'boolean',
    description:
      'Enable privileged context tools: list/select privileged contexts, evaluate privileged scripts, get/set Firefox prefs, and list extensions. Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.',
    default: (process.env.ENABLE_PRIVILEGED_CONTEXT ?? 'false') === 'true',
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx firefox-devtools-mcp@latest')
    .options(cliOptions)
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
