/**
 * Integration tests for the Firefox preferences tools
 * Tests with real Firefox browser in headless mode.
 *
 * The prefs tools read and write via Services.prefs in a chrome-privileged
 * context, which requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.
 */

import { describe, it, expect, vi } from 'vitest';
import { McpToolResponse } from '@/types/common.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { handleSetFirefoxPrefs, handleGetFirefoxPrefs } from '@/tools/firefox-prefs.js';
import { createTestFirefox, closeFirefox } from '../helpers/firefox.js';

// The prefs tools resolve the browser through the server's global getFirefox(),
// so it is redirected to the Firefox instance launched by this test.
const testState = vi.hoisted(() => ({ firefox: null as FirefoxClient | null }));

vi.mock('../../src/index.js', () => ({
  getFirefox: async () => testState.firefox,
}));

const TEST_PREFS = {
  testBoolPref: true,
  testIntPref: 42,
  testStringPref: 'test value',
};

/** Parse the `  name = <json value>` lines of a get_firefox_prefs response. */
function parsePrefsResponse(text: string): Record<string, unknown> {
  const prefs: Record<string, unknown> = {};
  for (const line of text.split('\n')) {
    const match = /^ {2}(\S+) = (.*)$/.exec(line);
    if (match) {
      prefs[match[1]] = match[2] === '(not set)' ? undefined : JSON.parse(match[2]);
    }
  }
  return prefs;
}

function responseText(response: McpToolResponse): string {
  return response.content.map((item) => (item.text as string) ?? '').join('\n');
}

async function runWithFirefox(allowPrivilegedAccess: boolean, testFn: () => Promise<void>) {
  try {
    testState.firefox = await createTestFirefox({
      env: allowPrivilegedAccess ? { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } : {},
    });
    await testFn();
  } finally {
    const { firefox } = testState;
    testState.firefox = null;
    await closeFirefox(firefox);
  }
}

describe('Firefox Prefs Integration Tests', () => {
  it('handleGetFirefoxPrefs should handle non-existent preferences', async () => {
    await runWithFirefox(true, async () => {
      const result = await handleGetFirefoxPrefs({ names: ['nonexistent.pref'] });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('(not set)');
    });
  }, 30000);

  it('handleGetFirefoxPrefs should return helpful error when privileged access is not enabled', async () => {
    await runWithFirefox(false, async () => {
      const result = await handleGetFirefoxPrefs({ names: Object.keys(TEST_PREFS) });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
    });
  }, 30000);

  it('handleSetFirefoxPrefs should return helpful error when privileged access is not enabled', async () => {
    await runWithFirefox(false, async () => {
      const result = await handleSetFirefoxPrefs({ prefs: TEST_PREFS });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
    });
  }, 30000);

  it('handleGetFirefoxPrefs should read back the values that were set by handleSetFirefoxPrefs', async () => {
    await runWithFirefox(true, async () => {
      const setResponse = await handleSetFirefoxPrefs({ prefs: TEST_PREFS });
      const setText = responseText(setResponse);
      expect(setText).toContain('Set 3 preference(s)');
      expect(setText).not.toContain('Failed to set');

      const getResponse = await handleGetFirefoxPrefs({ names: Object.keys(TEST_PREFS) });
      const getText = responseText(getResponse);
      expect(getText).not.toContain('Failed to read');

      expect(parsePrefsResponse(getText)).toEqual(TEST_PREFS);
    });
  }, 30000);
});
