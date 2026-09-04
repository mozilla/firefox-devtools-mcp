/**
 * Unit tests for the tool module registry.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODULES, PRESETS, DEFAULT_PRESET } from '../../src/tools/index.js';
import { buildToolset } from '../../src/tools/registry.js';
import type { ToolModule } from '../../src/tools/module.js';

// Tool files whose exports are not modules; everything else in src/tools is
// expected to declare a module via defineModule.
const NON_MODULE_FILES = new Set(['index.ts', 'instructions.ts', 'module.ts', 'registry.ts']);
const TOOLS_DIR = new URL('../../src/tools/', import.meta.url);

describe('Tool registry', () => {
  describe('modules', () => {
    it('has unique module names', () => {
      const names = MODULES.map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('registers every module declared in a tool file (no orphans)', async () => {
      const files = readdirSync(fileURLToPath(TOOLS_DIR))
        .filter((f) => f.endsWith('.ts') && !NON_MODULE_FILES.has(f))
        .sort();

      const orphans: string[] = [];
      for (const file of files) {
        const exports = (await import(/* @vite-ignore */ new URL(file, TOOLS_DIR).href)) as {
          module?: ToolModule;
        };
        if (!exports.module) {
          orphans.push(`${file} (no "module" export)`);
        } else if (!MODULES.includes(exports.module)) {
          orphans.push(`${file} (module "${exports.module.name}" missing from MODULES)`);
        }
      }

      expect(orphans, `Unregistered tool modules found. Add them to src/tools/index.ts`).toEqual(
        []
      );
    });

    it('assigns every tool to exactly one module with matching def/handler', () => {
      const seen = new Set<string>();
      for (const module of MODULES) {
        for (const { definition, handler } of module.tools) {
          expect(typeof handler).toBe('function');
          expect(typeof definition.name).toBe('string');
          expect(seen.has(definition.name)).toBe(false);
          seen.add(definition.name);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
    });

    it('marks prefs and privileged as privileged modules', () => {
      const privileged = MODULES.filter((m) => m.privileged)
        .map((m) => m.name)
        .sort();
      expect(privileged).toEqual(['prefs', 'privileged']);
    });

    it('registers list_extensions only in the privileged module', () => {
      const owners = MODULES.filter((module) =>
        module.tools.some(({ definition }) => definition.name === 'list_extensions')
      ).map((module) => module.name);

      expect(owners).toEqual(['privileged']);
    });
  });

  describe('presets', () => {
    it('are layered supersets: slim < basic < developer < mozilla', () => {
      const isSubset = (a: string[], b: string[]) => a.every((x) => b.includes(x));
      expect(isSubset(PRESETS.slim, PRESETS.basic)).toBe(true);
      expect(isSubset(PRESETS.basic, PRESETS.developer)).toBe(true);
      expect(isSubset(PRESETS.developer, PRESETS.mozilla)).toBe(true);
    });

    it('all preset contains every module', () => {
      expect([...PRESETS.all].sort()).toEqual(MODULES.map((m) => m.name).sort());
    });

    it('basic (default) excludes debugging, prefs, and privileged', () => {
      expect(PRESETS[DEFAULT_PRESET]).not.toContain('debugging');
      expect(PRESETS[DEFAULT_PRESET]).not.toContain('prefs');
      expect(PRESETS[DEFAULT_PRESET]).not.toContain('privileged');
    });
  });

  describe('buildToolset', () => {
    it('defaults to the basic preset with no warnings', () => {
      const { moduleNames, warnings } = buildToolset({});
      expect(moduleNames).toEqual(
        MODULES.map((m) => m.name).filter((n) => PRESETS.basic.includes(n))
      );
      expect(warnings).toEqual([]);
    });

    it('honors an explicit preset', () => {
      const { moduleNames } = buildToolset({ preset: 'slim' });
      expect(moduleNames).toEqual(
        MODULES.map((m) => m.name).filter((n) => PRESETS.slim.includes(n))
      );
    });

    it('does not select privileged modules from permission alone', () => {
      const { moduleNames, handlers } = buildToolset({
        preset: 'basic',
        allowPrivileged: true,
      });

      expect(moduleNames).not.toContain('prefs');
      expect(moduleNames).not.toContain('privileged');
      expect(handlers.has('list_extensions')).toBe(false);
    });

    it('exposes privileged modules when selected and allowed', () => {
      const { moduleNames, handlers } = buildToolset({
        preset: 'mozilla',
        allowPrivileged: true,
      });

      expect(moduleNames).toContain('prefs');
      expect(moduleNames).toContain('privileged');
      expect(handlers.has('list_extensions')).toBe(true);
    });

    it('lets --tools replace the preset entirely', () => {
      const { moduleNames } = buildToolset({
        tools: ['network', 'pages'],
        preset: 'developer',
      });
      // Canonical module order, not input order.
      expect(moduleNames).toEqual(['pages', 'network']);
    });

    it('warns and skips unknown module names', () => {
      const { moduleNames, warnings } = buildToolset({ tools: ['pages', 'bogus'] });
      expect(moduleNames).toEqual(['pages']);
      expect(warnings.some((w) => w.includes('bogus'))).toBe(true);
    });

    it('falls back to default preset on unknown preset name', () => {
      const { moduleNames, warnings } = buildToolset({ preset: 'nope' });
      expect(moduleNames).toContain('pages');
      expect(warnings.some((w) => w.includes('nope'))).toBe(true);
    });

    it('treats --enable-script as a deprecated alias for the developer preset', () => {
      const { moduleNames, warnings } = buildToolset({ enableScript: true });
      for (const name of PRESETS.developer) {
        expect(moduleNames).toContain(name);
      }
      expect(warnings.some((w) => w.includes('--enable-script is deprecated'))).toBe(true);
    });

    it('treats --enable-privileged-context as a deprecated alias for the mozilla preset', () => {
      const { moduleNames, warnings } = buildToolset({
        enablePrivilegedContext: true,
        allowPrivileged: true,
      });
      for (const name of PRESETS.mozilla) {
        expect(moduleNames).toContain(name);
      }
      expect(warnings.some((w) => w.includes('--enable-privileged-context is deprecated'))).toBe(
        true
      );
    });

    it('ignores legacy --enable-script when an explicit --tools list is given', () => {
      const { moduleNames, warnings } = buildToolset({
        tools: ['pages', 'network'],
        enableScript: true,
      });
      expect(moduleNames).toEqual(['pages', 'network']);
      expect(moduleNames).not.toContain('script');
      expect(moduleNames).not.toContain('debugging');
      expect(warnings.some((w) => w.includes('--enable-script is ignored'))).toBe(true);
    });

    it('ignores legacy --enable-privileged-context when an explicit --tools list is given', () => {
      const { moduleNames, warnings } = buildToolset({
        tools: ['pages'],
        enablePrivilegedContext: true,
        allowPrivileged: true,
      });
      expect(moduleNames).toEqual(['pages']);
      expect(warnings.some((w) => w.includes('--enable-privileged-context is ignored'))).toBe(true);
    });

    it('still applies legacy flags on top of a preset', () => {
      const { moduleNames } = buildToolset({ preset: 'basic', enableScript: true });
      for (const name of PRESETS.developer) {
        expect(moduleNames).toContain(name);
      }
    });

    it('drops privileged modules when not allowed, with a warning', () => {
      const { moduleNames, warnings } = buildToolset({
        tools: ['pages', 'privileged', 'prefs'],
        allowPrivileged: false,
      });
      expect(moduleNames).toEqual(['pages']);
      expect(warnings.some((w) => w.toLowerCase().includes('privileged'))).toBe(true);
    });

    it('drops privileged modules silently from a preset when not allowed', () => {
      const { moduleNames } = buildToolset({
        preset: 'mozilla',
        allowPrivileged: false,
      });
      expect(moduleNames).not.toContain('privileged');
      expect(moduleNames).not.toContain('prefs');
    });

    it('fails closed: drops privileged modules when allowPrivileged is omitted', () => {
      const { moduleNames } = buildToolset({ tools: ['pages', 'privileged', 'prefs'] });
      expect(moduleNames).toEqual(['pages']);
    });

    it('de-duplicates modules requested twice', () => {
      const { moduleNames } = buildToolset({ tools: ['pages', 'pages', 'network'] });
      expect(moduleNames).toEqual(['pages', 'network']);
    });

    it('builds matching definitions and handlers for the resolved modules', () => {
      const { toolDefinitions, handlers } = buildToolset({ tools: ['pages', 'network'] });
      const names = toolDefinitions.map((d) => d.name);
      expect(names).toContain('list_pages');
      expect(names).toContain('get_network_request');
      for (const name of names) {
        expect(handlers.has(name)).toBe(true);
      }
      expect(handlers.size).toBe(toolDefinitions.length);
    });

    it('builds no tools when the selection resolves to nothing', () => {
      const { toolDefinitions, handlers } = buildToolset({ tools: ['bogus'] });
      expect(toolDefinitions).toEqual([]);
      expect(handlers.size).toBe(0);
    });
  });
});
