/**
 * Tests for Firefox preferences tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setFirefoxPrefsTool,
  getFirefoxPrefsTool,
  handleSetFirefoxPrefs,
  handleGetFirefoxPrefs,
} from '../../src/tools/firefox-prefs.js';

// Mock the index module
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

describe('Firefox Prefs Tool Definitions', () => {
  describe('setFirefoxPrefsTool', () => {
    it('should have correct name', () => {
      expect(setFirefoxPrefsTool.name).toBe('set_firefox_prefs');
    });

    it('should require prefs parameter', () => {
      const schema = setFirefoxPrefsTool.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toContain('prefs');
    });

    it('should have description', () => {
      expect(setFirefoxPrefsTool.description).toBeDefined();
      expect(setFirefoxPrefsTool.description.length).toBeGreaterThan(0);
    });

    it('should define prefs as object type', () => {
      const schema = setFirefoxPrefsTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.prefs?.type).toBe('object');
    });
  });

  describe('getFirefoxPrefsTool', () => {
    it('should have correct name', () => {
      expect(getFirefoxPrefsTool.name).toBe('get_firefox_prefs');
    });

    it('should require names parameter', () => {
      const schema = getFirefoxPrefsTool.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toContain('names');
    });

    it('should have description', () => {
      expect(getFirefoxPrefsTool.description).toBeDefined();
      expect(getFirefoxPrefsTool.description.length).toBeGreaterThan(0);
    });

    it('should define names as array type', () => {
      const schema = getFirefoxPrefsTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.names?.type).toBe('array');
    });
  });
});

describe('Firefox Prefs Tool Handlers', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = originalEnv;
    } else {
      delete process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS;
    }
  });

  describe('handleSetFirefoxPrefs', () => {
    it('should return error when prefs parameter is missing', async () => {
      const result = await handleSetFirefoxPrefs({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('prefs parameter is required');
    });

    it('should return success when prefs is empty', async () => {
      const result = await handleSetFirefoxPrefs({ prefs: {} });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('No preferences to set');
    });
  });

  describe('handleGetFirefoxPrefs', () => {
    it('should return error when names parameter is missing', async () => {
      const result = await handleGetFirefoxPrefs({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('names parameter is required');
    });

    it('should return error when names is empty array', async () => {
      const result = await handleGetFirefoxPrefs({ names: [] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('names parameter is required');
    });
  });
});
