/**
 * Integration tests for tab management
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
  findNodesInSnapshot,
  waitForPageLoad,
  fixtureUrl,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import type { SnapshotNode } from '@/firefox/snapshot/types.js';

describe('Tab Management Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should list tabs', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);

    await firefox.refreshTabs();
    const tabs = firefox.getTabs();

    expect(tabs).toBeDefined();
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs[firefox.getSelectedTabIdx()]).toMatchObject({
      title: 'Simple Test Page',
      url: fixturePath,
    });
  }, 15000);

  it('should create new tab', async () => {
    await firefox.refreshTabs();
    const initialTabs = firefox.getTabs();
    const initialTabCount = initialTabs.length;

    const fixturePath = fixtureUrl('simple.html');
    const newTabIndex = await firefox.createNewPage(fixturePath);

    await firefox.refreshTabs();
    const updatedTabs = firefox.getTabs();

    expect(updatedTabs.length).toBe(initialTabCount + 1);
    expect(typeof newTabIndex).toBe('number');
    expect(newTabIndex).toBeGreaterThanOrEqual(0);
    expect(updatedTabs[newTabIndex]?.url).toBe(fixturePath);
    expect(firefox.getSelectedTabIdx()).toBe(newTabIndex);
  }, 15000);

  it('should switch between tabs', async () => {
    await firefox.refreshTabs();

    // Create second tab
    const fixturePath = fixtureUrl('form.html');
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
      const fixturePath = fixtureUrl('simple.html');
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
    const simplePath = fixtureUrl('simple.html');
    const formPath = fixtureUrl('form.html');

    await firefox.navigate(simplePath);
    await waitForPageLoad();
    const tab1Index = firefox.getSelectedTabIdx();

    const tab2Index = await firefox.createNewPage(formPath);
    await firefox.selectTab(tab2Index);
    await waitForPageLoad();

    // Wait for form elements to appear in tab 2
    const emailElement = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'email',
      10000
    );

    expect(emailElement).toBeDefined();

    // Take snapshot in tab 2 (form page)
    const snapshot2 = await firefox.takeSnapshot();
    const formElements = findNodesInSnapshot(snapshot2.json.root, (node) => node.id === 'email');

    expect(formElements.length).toBeGreaterThan(0);

    // Switch to tab 1 (simple page)
    await firefox.selectTab(tab1Index);
    await waitForPageLoad();

    // Wait for button to appear in tab 1
    const clickBtnElement = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'clickBtn',
      10000
    );

    expect(clickBtnElement).toBeDefined();

    // Take snapshot in tab 1
    const snapshot1 = await firefox.takeSnapshot();
    const simpleElements = findNodesInSnapshot(
      snapshot1.json.root,
      (node) => node.id === 'clickBtn'
    );

    expect(simpleElements.length).toBeGreaterThan(0);

    // Each tab has its own registry, so the two snapshots must not share UIDs
    const uids = (root: SnapshotNode) => findNodesInSnapshot(root, () => true).map((n) => n.uid);
    const uids1 = new Set(uids(snapshot1.json.root));
    expect(uids(snapshot2.json.root).some((uid) => uids1.has(uid))).toBe(false);
  }, 30000);

  it('should get selected tab index', async () => {
    await firefox.refreshTabs();
    const selectedIdx = firefox.getSelectedTabIdx();

    expect(typeof selectedIdx).toBe('number');
    expect(selectedIdx).toBeGreaterThanOrEqual(0);
  }, 10000);
});
