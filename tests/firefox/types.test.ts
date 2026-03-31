/**
 * Tests for Firefox type definitions
 */

import { describe, it, expect } from 'vitest';
import type { FirefoxLaunchOptions } from '../../src/firefox/types.js';

describe('FirefoxLaunchOptions', () => {
  it('should accept prefs field', () => {
    const options: FirefoxLaunchOptions = {
      headless: true,
      prefs: { a: 'b', num: 42, bool: true },
    };
    expect(options.prefs).toBeDefined();
    expect(options.prefs).toEqual({ a: 'b', num: 42, bool: true });
  });

  it('should accept empty prefs object', () => {
    const options: FirefoxLaunchOptions = {
      headless: true,
      prefs: {},
    };
    expect(options.prefs).toEqual({});
  });

  it('should allow prefs to be undefined', () => {
    const options: FirefoxLaunchOptions = {
      headless: true,
    };
    expect(options.prefs).toBeUndefined();
  });
});
