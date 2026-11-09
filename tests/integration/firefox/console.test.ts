/**
 * Integration tests for console capture
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, join } from 'node:path';
import { removeDir } from '../../helpers/fs.js';
import {
  createTestFirefox,
  closeFirefox,
  waitFor,
  waitForElementInSnapshot,
  waitForPageLoad,
  fixtureUrl,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { ReadinessState } from '@/firefox/bidi.js';

describe('Console subscription lifecycle', () => {
  let firefox: FirefoxClient;
  let profileRoot: string;
  const temporaryRoot = realpathSync(tmpdir());

  beforeEach(async () => {
    profileRoot = mkdtempSync(join(temporaryRoot, 'firefox-console-lifecycle-'));
    firefox = await createTestFirefox({ profilePath: profileRoot });
  });

  afterEach(async () => {
    await closeFirefox(firefox);
    expect(dirname(realpathSync(profileRoot))).toBe(temporaryRoot);
    expect(basename(profileRoot).startsWith('firefox-console-lifecycle-')).toBe(true);
    removeDir(profileRoot);
  });

  it('starts collection on the first read and receives cached page-load messages', async () => {
    await firefox.navigate(fixtureUrl('console.html'), ReadinessState.Complete);

    expect(await firefox.getConsoleMessages({ startListening: false })).toEqual([]);

    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((message) => message.text.includes('Info message on load'));
    });
  });

  it('does not duplicate messages when the first reads are concurrent', async () => {
    await Promise.all(Array.from({ length: 8 }, () => firefox.getConsoleMessages()));
    firefox.clearConsoleMessages();
    const text = 'concurrent-console-subscription';
    await firefox.evaluate(`console.log(${JSON.stringify(text)})`);

    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((message) => message.text === text);
    });

    const messages = await firefox.getConsoleMessages();
    expect(messages.filter((message) => message.text === text)).toHaveLength(1);
  });

  it('starts a fresh collection after reconnecting', async () => {
    await firefox.getConsoleMessages();
    await firefox.close();
    await firefox.connect();
    await firefox.navigate(fixtureUrl('console.html'), ReadinessState.Complete);

    expect(await firefox.getConsoleMessages({ startListening: false })).toEqual([]);
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((message) => message.text.includes('Info message on load'));
    });
  });
});

describe('Console Capture Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should capture console messages on page load', async () => {
    firefox.clearConsoleMessages();

    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for console messages to be captured
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.length > 0;
    }, 5000);

    const messages = await firefox.getConsoleMessages();

    // Should have messages from page load
    expect(messages.length).toBeGreaterThan(0);

    // Check for specific log levels
    const infoMessage = messages.find((msg) => msg.text.includes('Info message on load'));
    const warnMessage = messages.find((msg) => msg.text.includes('Warning message on load'));
    const errorMessage = messages.find((msg) => msg.text.includes('Error message on load'));

    expect(infoMessage).toBeDefined();
    expect(warnMessage).toBeDefined();
    expect(errorMessage).toBeDefined();
  }, 15000);

  it('should capture console.log from button click', async () => {
    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log info button to appear in snapshot
    const logInfoBtn = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'logInfo',
      10000
    );

    expect(logInfoBtn).toBeDefined();

    await firefox.clickByUid(logInfoBtn.uid);

    // Wait for console message
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((msg) => msg.text.includes('Info message from button'));
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const buttonMessage = messages.find((msg) => msg.text.includes('Info message from button'));

    expect(buttonMessage).toBeDefined();
    expect(buttonMessage?.level).toBe('info');
  }, 15000);

  it('should capture console.warn from button click', async () => {
    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log warn button to appear in snapshot
    const logWarnBtn = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'logWarn',
      10000
    );

    expect(logWarnBtn).toBeDefined();

    await firefox.clickByUid(logWarnBtn.uid);

    // Wait for console message
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((msg) => msg.text.includes('Warning message from button'));
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const warnMessage = messages.find((msg) => msg.text.includes('Warning message from button'));

    expect(warnMessage).toBeDefined();
    expect(warnMessage?.level).toBe('warn');
  }, 15000);

  it('should capture console.error from button click', async () => {
    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log error button to appear in snapshot
    const logErrorBtn = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'logError',
      10000
    );

    expect(logErrorBtn).toBeDefined();

    await firefox.clickByUid(logErrorBtn.uid);

    // Wait for console message
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((msg) => msg.text.includes('Error message from button'));
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const errorMessage = messages.find((msg) => msg.text.includes('Error message from button'));

    expect(errorMessage).toBeDefined();
    expect(errorMessage?.level).toBe('error');
  }, 15000);

  it('should clear console messages', async () => {
    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for messages from page load
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.length > 0;
    }, 5000);

    let messages = await firefox.getConsoleMessages();
    expect(messages.length).toBeGreaterThan(0);

    // Clear messages
    firefox.clearConsoleMessages();

    messages = await firefox.getConsoleMessages();
    expect(messages.length).toBe(0);
  }, 15000);

  it('should have timestamp in console messages', async () => {
    firefox.clearConsoleMessages();

    const fixturePath = fixtureUrl('console.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for messages
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.length > 0;
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const messageWithTimestamp = messages.find((msg) => msg.timestamp);

    expect(messageWithTimestamp).toBeDefined();
    expect(typeof messageWithTimestamp?.timestamp).toBe('number');
  }, 15000);
});
