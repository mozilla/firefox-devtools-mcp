/**
 * Integration tests for form interaction
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
  waitForPageLoad,
} from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');

describe('Form Interaction Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should hover over element by UID', async () => {
    const fixturePath = `file://${fixturesPath}/form.html`;
    await firefox.navigate(fixturePath);

    // Wait for page to be fully loaded
    await waitForPageLoad();

    // Wait for submit button to appear in snapshot
    const submitBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#submitBtn') || entry.css.includes('submitBtn'),
      10000
    );

    expect(submitBtn).toBeDefined();

    // Hover should not throw
    await expect(firefox.hoverByUid(submitBtn.uid)).resolves.not.toThrow();
  }, 15000);
});
