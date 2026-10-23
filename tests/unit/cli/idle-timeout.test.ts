/**
 * Tests for --idle-timeout CLI parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../src/cli.js';

describe('--idle-timeout parsing', () => {
  it('defaults to 30 minutes', () => {
    const args = parseArguments('1.0.0', ['node', 'script']);
    expect(args.idleTimeout).toBe(1800);
  });

  it('accepts a number of seconds', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--idle-timeout', '120']);
    expect(args.idleTimeout).toBe(120);
  });
});
