/**
 * Unit tests for constants
 */

import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { SERVER_NAME, SERVER_VERSION } from '../../src/config/constants.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

describe('Constants', () => {
  describe('SERVER_NAME', () => {
    it('should be a non-empty string', () => {
      expect(SERVER_NAME).toBeTruthy();
      expect(typeof SERVER_NAME).toBe('string');
    });

    it('should be firefox-devtools', () => {
      expect(SERVER_NAME).toBe('firefox-devtools');
    });
  });

  describe('SERVER_VERSION', () => {
    it('should be a valid semver version', () => {
      expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should match package.json version', () => {
      expect(SERVER_VERSION).toBe(pkg.version);
    });

    it('should be a non-empty string', () => {
      expect(SERVER_VERSION).toBeTruthy();
      expect(typeof SERVER_VERSION).toBe('string');
    });

    it('should have three version parts', () => {
      const parts = SERVER_VERSION.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    it('should have numeric major, minor, and patch versions', () => {
      const parts = SERVER_VERSION.split('.');
      expect(parseInt(parts[0])).toBeGreaterThanOrEqual(0);
      expect(parseInt(parts[1])).toBeGreaterThanOrEqual(0);
      expect(parseInt(parts[2])).toBeGreaterThanOrEqual(0);
    });
  });
});
