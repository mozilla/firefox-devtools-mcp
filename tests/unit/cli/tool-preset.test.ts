/**
 * Tests for --tool-preset CLI parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../src/cli.js';

describe('--tool-preset parsing', () => {
  it('accepts a known preset', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--tool-preset', 'developer']);
    expect(args.toolPreset).toBe('developer');
  });

  // An unknown preset must not hard-exit at parse time: it is passed through so
  // buildToolset can warn and fall back to the default. yargs `choices` would
  // instead reject it (including a typo'd TOOL_PRESET default) and exit.
  it('passes an unknown preset through instead of exiting', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--tool-preset', 'mozila']);
    expect(args.toolPreset).toBe('mozila');
  });
});
