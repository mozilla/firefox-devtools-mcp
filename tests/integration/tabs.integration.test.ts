/**
 * Integration tests for tab management
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

describe('Tab Management Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should list tabs', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);

    await firefox.refreshTabs();
    const tabs = firefox.getTabs();

    expect(tabs).toBeDefined();
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
  }, 15000);

  it('should create new tab', async () => {
    await firefox.refreshTabs();
    const initialTabs = firefox.getTabs();
    const initialTabCount = initialTabs.length;

    const fixturePath = `file://${fixturesPath}/simple.html`;
    const newTabIndex = await firefox.createNewPage(fixturePath);

    await firefox.refreshTabs();
    const updatedTabs = firefox.getTabs();

    expect(updatedTabs.length).toBe(initialTabCount + 1);
    expect(typeof newTabIndex).toBe('number');
    expect(newTabIndex).toBeGreaterThanOrEqual(0);
  }, 15000);

  it('should switch between tabs', async () => {
    await firefox.refreshTabs();
    const initialTabs = firefox.getTabs();

    // Create second tab
    const fixturePath = `file://${fixturesPath}/form.html`;
    const newTabIndex = await firefox.createNewPage(fixturePath);

    await firefox.refreshTabs();

    // Switch to new tab
    await firefox.selectTab(newTabIndex);

    const selectedIdx = firefox.getSelectedTabIdx();
    expect(selectedIdx).toBe(newTabIndex);

    // Switch back to first tab
    await firefox.selectTab(0);

    const newSelectedIdx = firefox.getSelectedTabIdx();
    expect(newSelectedIdx).toBe(0);
  }, 20000);

  it('should close tab', async () => {
    await firefox.refreshTabs();
    const initialTabs = firefox.getTabs();

    if (initialTabs.length < 2) {
      // Create additional tab if needed
      const fixturePath = `file://${fixturesPath}/simple.html`;
      await firefox.createNewPage(fixturePath);
      await firefox.refreshTabs();
    }

    const tabsBeforeClose = firefox.getTabs();
    const tabCountBeforeClose = tabsBeforeClose.length;

    // Close the last tab (not the current one)
    const lastTabIndex = tabCountBeforeClose - 1;
    await firefox.closeTab(lastTabIndex);

    await firefox.refreshTabs();
    const tabsAfterClose = firefox.getTabs();

    expect(tabsAfterClose.length).toBe(tabCountBeforeClose - 1);
  }, 20000);

  it('should have snapshot isolation between tabs', async () => {
    // Create two tabs with different pages
    const simplePath = `file://${fixturesPath}/simple.html`;
    const formPath = `file://${fixturesPath}/form.html`;

    await firefox.navigate(simplePath);
    await waitForPageLoad();
    const tab1Index = firefox.getSelectedTabIdx();

    const tab2Index = await firefox.createNewPage(formPath);
    await firefox.selectTab(tab2Index);
    await waitForPageLoad();

    // Wait for form elements to appear in tab 2
    const emailElement = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#email') || entry.css.includes('email'),
      10000
    );

    expect(emailElement).toBeDefined();

    // Take snapshot in tab 2 (form page)
    const snapshot2 = await firefox.takeSnapshot();
    const formElements = snapshot2.json.uidMap.filter(
      (entry) => entry.css.includes('#email') || entry.css.includes('email')
    );

    expect(formElements.length).toBeGreaterThan(0);

    // Switch to tab 1 (simple page)
    await firefox.selectTab(tab1Index);
    await waitForPageLoad();

    // Wait for button to appear in tab 1
    const clickBtnElement = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#clickBtn') || entry.css.includes('clickBtn'),
      10000
    );

    expect(clickBtnElement).toBeDefined();

    // Take snapshot in tab 1
    const snapshot1 = await firefox.takeSnapshot();
    const simpleElements = snapshot1.json.uidMap.filter(
      (entry) => entry.css.includes('#clickBtn') || entry.css.includes('clickBtn')
    );

    expect(simpleElements.length).toBeGreaterThan(0);

    // Snapshot IDs should be different
    expect(snapshot1.json.snapshotId).not.toBe(snapshot2.json.snapshotId);
  }, 30000);

  it('should get selected tab index', async () => {
    await firefox.refreshTabs();
    const selectedIdx = firefox.getSelectedTabIdx();

    expect(typeof selectedIdx).toBe('number');
    expect(selectedIdx).toBeGreaterThanOrEqual(0);
  }, 10000);
});
