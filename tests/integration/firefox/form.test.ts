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
  fixtureUrl,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

describe('Form Interaction Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should hover over element by UID', async () => {
    const fixturePath = fixtureUrl('form.html');
    await firefox.navigate(fixturePath);

    // Wait for page to be fully loaded
    await waitForPageLoad();

    // Wait for submit button to appear in snapshot
    const submitBtn = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'submitBtn',
      10000
    );

    expect(submitBtn).toBeDefined();

    // Hover should not throw
    await expect(firefox.hoverByUid(submitBtn.uid)).resolves.not.toThrow();
  }, 15000);
});
