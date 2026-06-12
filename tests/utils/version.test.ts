/**
 * Unit tests for logger utilities
 */

import { describe, it, expect } from 'vitest';
import { compareVersions } from '../../src/utils/version.js';

describe('Version helpers', () => {
  describe('compareVersions', () => {
    it('should return -1 for lower version', () => {
      expect(compareVersions('153.0a1', '154.0')).toBe(-1);
      expect(compareVersions('16.0a1', '154.0')).toBe(-1);
      expect(compareVersions('153.0a1', '154')).toBe(-1);
      expect(compareVersions('153', '154.0')).toBe(-1);
    });
    it('should return 1 for greater version', () => {
      expect(compareVersions('153.0a1', '152.0')).toBe(1);
      expect(compareVersions('153.0a1', '99.0')).toBe(1);
      expect(compareVersions('153', '99.0')).toBe(1);
      expect(compareVersions('153.0a1', '99')).toBe(1);
    });
    it('should return 0 for identical major', () => {
      expect(compareVersions('153.0a1', '153.0')).toBe(0);
      expect(compareVersions('153.0a1', '153.99')).toBe(0);
      expect(compareVersions('153.0a1', '153')).toBe(0);
      expect(compareVersions('153.0a1', '153.xyz')).toBe(0);
    });
    it('should throw on unparseable version string', () => {
      expect(() => compareVersions('', '153.0')).toThrow('Unable to parse Firefox version');
      expect(() => compareVersions('153.0', '')).toThrow('Unable to parse Firefox version');
    });
  });
});
