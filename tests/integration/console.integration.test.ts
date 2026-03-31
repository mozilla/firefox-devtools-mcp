/**
 * Integration tests for console capture
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitFor,
  waitForElementInSnapshot,
  waitForPageLoad,
} from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');

describe('Console Capture Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should capture console messages on page load', async () => {
    firefox.clearConsoleMessages();

    const fixturePath = `file://${fixturesPath}/console.html`;
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
    const fixturePath = `file://${fixturesPath}/console.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log info button to appear in snapshot
    const logInfoBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#logInfo') || entry.css.includes('logInfo'),
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
    const fixturePath = `file://${fixturesPath}/console.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log warn button to appear in snapshot
    const logWarnBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#logWarn') || entry.css.includes('logWarn'),
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
    const fixturePath = `file://${fixturesPath}/console.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearConsoleMessages();

    // Wait for log error button to appear in snapshot
    const logErrorBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#logError') || entry.css.includes('logError'),
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
    const fixturePath = `file://${fixturesPath}/console.html`;
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

    const fixturePath = `file://${fixturesPath}/console.html`;
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
