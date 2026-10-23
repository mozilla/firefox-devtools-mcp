/**
 * Unit tests for the server instructions sent in the initialize response.
 */

import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../../src/tools/index.js';
import { buildToolset } from '../../../src/tools/registry.js';

describe('Server instructions', () => {
  it('lists only the enabled modules', () => {
    const { instructions } = buildToolset({ tools: ['pages', 'network'] });
    expect(instructions).toContain('- pages: ');
    expect(instructions).toContain('- network: ');
    expect(instructions).not.toContain('- console: ');
  });

  it('only suggests loading tools which are enabled', () => {
    const { instructions } = buildToolset({ tools: ['pages'] });
    expect(instructions).toContain('list_pages');
    expect(instructions).not.toContain('take_snapshot');
    expect(instructions).not.toContain('list_console_messages');
  });

  it('never names a tool that does not exist (catches renames)', () => {
    const { instructions, toolDefinitions } = buildToolset({
      preset: 'all',
      allowPrivileged: true,
    });
    const names = new Set(toolDefinitions.map((d) => d.name));
    // Tool names are the only snake_case tokens in the instructions.
    const mentioned = instructions.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    expect(mentioned.length).toBeGreaterThan(0);
    expect(mentioned.filter((name) => !names.has(name))).toEqual([]);
  });

  it('stays within the size clients are willing to load', () => {
    for (const preset of Object.keys(PRESETS)) {
      const { instructions } = buildToolset({ preset, allowPrivileged: true });
      expect(instructions.length).toBeLessThan(2048);
    }
  });
});
