/**
 * Tool registry logic.
 *
 * Reads the module catalog (index.ts) and turns CLI configuration into the set
 * of tools to expose: buildToolset resolves which modules are enabled (applying
 * presets, deprecated flags, and the privileged gate) and builds the tool
 * definition list + name->handler map + server instructions for them.
 */

import { MODULES, MODULE_NAMES, PRESETS, DEFAULT_PRESET } from './index.js';
import { buildInstructions } from './instructions.js';
import type { ToolDefinition, ToolHandler } from './module.js';

export interface ToolsetOptions {
  tools?: string[] | undefined;
  preset?: string | undefined;
  enableScript?: boolean | undefined;
  enablePrivilegedContext?: boolean | undefined;
  allowPrivileged?: boolean | undefined;
}

export interface Toolset {
  moduleNames: string[];
  warnings: string[];
  toolDefinitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
  instructions: string;
}

const privilegedModuleNames = new Set(MODULES.filter((m) => m.privileged).map((m) => m.name));

/**
 * Resolve the enabled modules from CLI configuration and build their tools.
 *
 * Returns the resolved module names and any warnings alongside the tool
 * definitions and name->handler map, so the caller can log both and register
 * the tools. See selectModules for how the module set is resolved.
 */
export function buildToolset(options: ToolsetOptions): Toolset {
  const { moduleNames, warnings } = selectModules(options);
  const { toolDefinitions, handlers } = collectTools(moduleNames);
  const instructions = buildInstructions(moduleNames, new Set(handlers.keys()));
  return { moduleNames, warnings, toolDefinitions, handlers, instructions };
}

/**
 * Resolve the set of enabled module names from CLI configuration.
 *
 * - `tools`, when provided, replaces the preset entirely (exact module set).
 * - Otherwise the named `preset` applies (default: basic).
 * - Legacy `enableScript` / `enablePrivilegedContext` flags force the
 *   `developer` / `mozilla` presets on top and emit deprecation warnings.
 * - Privileged modules are dropped when `allowPrivileged` is false.
 */
function selectModules(options: ToolsetOptions): { moduleNames: string[]; warnings: string[] } {
  const { tools: requested, preset, enableScript, enablePrivilegedContext } = options;
  // Fail closed: without an explicit opt-in, privileged modules are dropped.
  const allowPrivileged = options.allowPrivileged ?? false;
  const warnings: string[] = [];

  // De-duplicate module names; canonical ordering is applied at the end.
  const selected = new Set<string>();
  const add = (name: string) => {
    if (MODULE_NAMES.includes(name)) {
      selected.add(name);
    } else {
      warnings.push(`Ignoring unknown tool module: "${name}"`);
    }
  };

  const usingExplicitTools = Boolean(requested && requested.length > 0);

  if (usingExplicitTools) {
    for (const name of requested!) {
      add(name);
    }
  } else {
    const presetName = preset ?? DEFAULT_PRESET;
    let presetModules = PRESETS[presetName];
    if (!presetModules) {
      warnings.push(`Unknown tool preset: "${presetName}". Falling back to "${DEFAULT_PRESET}".`);
      presetModules = PRESETS[DEFAULT_PRESET] ?? [];
    }
    for (const name of presetModules) {
      add(name);
    }
  }

  // Legacy flags are still supported, unless --tools was used.
  if (enableScript) {
    if (usingExplicitTools) {
      warnings.push('--enable-script is ignored when --tools is set; add "script" to --tools.');
    } else {
      warnings.push('--enable-script is deprecated; use --tools/--tool-preset instead.');
      for (const name of PRESETS.developer ?? []) {
        add(name);
      }
    }
  }
  if (enablePrivilegedContext) {
    if (usingExplicitTools) {
      warnings.push(
        '--enable-privileged-context is ignored when --tools is set; add "privileged"/"prefs" to --tools.'
      );
    } else {
      warnings.push(
        '--enable-privileged-context is deprecated; use --tools/--tool-preset instead.'
      );
      for (const name of PRESETS.mozilla ?? []) {
        add(name);
      }
    }
  }

  let moduleNames = [...selected];

  if (!allowPrivileged) {
    const dropped = moduleNames.filter((name) => privilegedModuleNames.has(name));
    if (dropped.length > 0) {
      warnings.push(
        `Privileged tool modules require --allow-system-access and were skipped: ${dropped.join(', ')}`
      );
    }
    moduleNames = moduleNames.filter((name) => !privilegedModuleNames.has(name));
  }

  // Return in canonical module order for stable output.
  moduleNames = MODULE_NAMES.filter((name) => moduleNames.includes(name));

  return { moduleNames, warnings };
}

/**
 * Build the tool definitions list and name->handler map for a set of modules.
 */
function collectTools(moduleNames: string[]): {
  toolDefinitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const byName = new Map(MODULES.map((m) => [m.name, m]));
  const toolDefinitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  for (const name of moduleNames) {
    const module = byName.get(name);
    if (!module) {
      continue;
    }
    for (const { definition, handler } of module.tools) {
      toolDefinitions.push(definition);
      handlers.set(definition.name, handler);
    }
  }

  return { toolDefinitions, handlers };
}
