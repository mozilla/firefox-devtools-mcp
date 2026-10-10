/**
 * Tool module catalog.
 *
 * The declarative half of the registry: it lists every tool module and the
 * presets that group them. Each module is declared in its own tool file via
 * `defineModule`; registering it here (import + an entry in MODULES, plus any
 * presets it belongs to) is all that is needed to expose it.
 *
 * `registry.ts` holds the logic that reads this catalog. A test
 * (tests/tools/registry.test.ts) fails if a tool file declares a module that is
 * not listed here, so a forgotten registration is caught rather than silently
 * dropping the tools.
 */

import { module as pages } from './pages.js';
import { module as snapshot } from './snapshot.js';
import { module as input } from './input.js';
import { module as network } from './network.js';
import { module as consoleModule } from './console.js';
import { module as screenshot } from './screenshot.js';
import { module as print } from './print.js';
import { module as downloads } from './downloads.js';
import { module as utilities } from './utilities.js';
import { module as management } from './firefox-management.js';
import { module as launch } from './firefox-launch.js';
import { module as webextension } from './webextension.js';
import { module as profiler } from './profiler.js';
import { module as screencast } from './screencast.js';
import { module as script } from './script.js';
import { module as debugging } from './debugging.js';
import { module as prefs } from './firefox-prefs.js';
import { module as privileged } from './privileged-context.js';
import type { ToolModule } from './module.js';

export type { ToolDefinition, ToolEntry, ToolModule } from './module.js';

export const MODULES: ToolModule[] = [
  pages,
  snapshot,
  input,
  network,
  consoleModule,
  screenshot,
  print,
  downloads,
  utilities,
  management,
  launch,
  webextension,
  profiler,
  screencast,
  script,
  debugging,
  prefs,
  privileged,
];

export const MODULE_NAMES = MODULES.map((m) => m.name);

// SLIM: Minimum set of tools to navigate and browser the web efficiently.
const SLIM = ['pages', 'snapshot', 'input', 'screenshot'];
// BASIC: Additional tools useful for regular web-browsing.
const BASIC = [
  ...SLIM,
  'downloads',
  'print',
  // script is often used as a workaround by agents when they can't deal with
  // the page using high level tools.
  'script',
  'utilities',
  'management',
  'webextension',
  'screencast',
];
// DEVELOPER: Tools only useful for web developers / firefox developers.
const DEVELOPER = [...BASIC, 'debugging', 'network', 'console', 'profiler'];
// MOZILLA: (all tools) Also includes privileged tools only useful for firefox
// developers.
const MOZILLA = [...DEVELOPER, 'launch', 'prefs', 'privileged'];

export const PRESETS: Record<string, string[]> = {
  slim: SLIM,
  basic: BASIC,
  developer: DEVELOPER,
  mozilla: MOZILLA,
  all: MODULE_NAMES,
};

export const PRESET_NAMES = Object.keys(PRESETS);

export const DEFAULT_PRESET = 'basic';
