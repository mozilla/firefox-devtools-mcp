/**
 * Integration tests for connecting to a Firefox that another client controls
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FirefoxCore } from '@/firefox/core.js';
import { createTestFirefox, closeFirefox } from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

describe('Connect Existing Integration Tests', () => {
  let firefox: FirefoxClient;
  let marionettePort: number;

  beforeAll(async () => {
    // This launched Firefox already holds a WebDriver session.
    firefox = await createTestFirefox();
    const capabilities = await firefox.getDriver().getCapabilities();
    const profile = capabilities.get('moz:profile') as string;
    marionettePort = Number(readFileSync(join(profile, 'MarionetteActivePort'), 'utf-8').trim());
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should fail fast when another session holds Marionette', async () => {
    const core = new FirefoxCore({ connectExisting: true, marionettePort });
    const start = Date.now();
    try {
      await expect(core.connect()).rejects.toThrow(
        `Another WebDriver session is already active in Firefox on 127.0.0.1:${marionettePort}`
      );
    } finally {
      await core.close();
    }
    // Without the greeting check, geckodriver retries for about 60 seconds.
    expect(Date.now() - start).toBeLessThan(10000);
  }, 20000);
});
