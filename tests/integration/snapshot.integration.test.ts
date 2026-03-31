/**
 * Integration tests for snapshot workflow
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

describe('Snapshot Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 60000); // 60 second timeout for browser startup (CI runners can be slow)

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should take snapshot and generate UIDs', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.json).toBeDefined();
    expect(snapshot.json.root).toBeDefined();
    expect(snapshot.json.uidMap).toBeDefined();
    expect(snapshot.json.uidMap.length).toBeGreaterThan(0);
    expect(snapshot.text).toBeDefined();
    expect(snapshot.text.length).toBeGreaterThan(0);
  }, 10000);

  it('should resolve UID to selector', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for button to appear in snapshot
    const buttonUid = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#clickBtn') || entry.css.includes('id="clickBtn"'),
      10000
    );

    expect(buttonUid).toBeDefined();

    const selector = firefox.resolveUidToSelector(buttonUid.uid);
    expect(selector).toBeDefined();
    expect(typeof selector).toBe('string');
  }, 10000);

  it('should click element by UID', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for button to appear in snapshot
    const buttonUid = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#clickBtn') || entry.css.includes('id="clickBtn"'),
      10000
    );

    expect(buttonUid).toBeDefined();

    // Click button - should not throw
    await expect(firefox.clickByUid(buttonUid.uid)).resolves.not.toThrow();
  }, 10000);

  it('should detect stale UIDs after navigation', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot1 = await firefox.takeSnapshot();
    const firstUid = snapshot1.json.uidMap[0]?.uid;

    expect(firstUid).toBeDefined();

    // Navigate to different page
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Old UID should be stale or not found
    if (firstUid) {
      await expect(firefox.clickByUid(firstUid)).rejects.toThrow(/(stale snapshot|UID not found)/);
    }
  }, 10000);

  it('should clear snapshot cache on navigation', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot1 = await firefox.takeSnapshot();
    const snapshotId1 = snapshot1.json.snapshotId;

    // Navigate to same page
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot2 = await firefox.takeSnapshot();
    const snapshotId2 = snapshot2.json.snapshotId;

    // Snapshot IDs should be different
    expect(snapshotId2).toBeGreaterThan(snapshotId1);
  }, 10000);

  it('should handle double-click by UID', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for double-click button to appear in snapshot
    const dblClickBtnUid = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#dblClickBtn') || entry.css.includes('id="dblClickBtn"'),
      10000
    );

    expect(dblClickBtnUid).toBeDefined();

    // Double-click button - should not throw
    await expect(firefox.clickByUid(dblClickBtnUid.uid, true)).resolves.not.toThrow();
  }, 10000);

  it('should clear snapshot manually', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();
    const firstUid = snapshot.json.uidMap[0]?.uid;

    expect(firstUid).toBeDefined();

    // Clear snapshot manually
    firefox.clearSnapshot();

    // UID should be stale after manual clear
    if (firstUid) {
      await expect(firefox.clickByUid(firstUid)).rejects.toThrow();
    }
  }, 10000);

  it('should return clear error for invalid CSS selector', async () => {
    const fixturePath = `file://${fixturesPath}/selector.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Test with a selector that genuinely causes querySelector to throw
    // Using :has() with unclosed parenthesis should trigger an exception
    const invalidSelector = '#test:has(';

    await expect(firefox.takeSnapshot({ selector: invalidSelector })).rejects.toThrow(
      /Invalid selector syntax/
    );
  }, 10000);

  it('should exclude children of hidden parents even in includeAll mode', async () => {
    const fixturePath = `file://${fixturesPath}/visibility.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Take snapshot with includeAll mode
    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that elements inside hidden parent are NOT in snapshot
    const hasHiddenButton = snapshot.json.uidMap.some(
      (entry) =>
        entry.css.includes('buttonInHiddenDiv') || entry.css.includes('id="buttonInHiddenDiv"')
    );
    const hasHiddenText = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('textInHiddenDiv') || entry.css.includes('id="textInHiddenDiv"')
    );

    expect(hasHiddenButton).toBe(false);
    expect(hasHiddenText).toBe(false);

    // Check that visible elements ARE in snapshot
    const hasVisibleButton = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('visibleButton') || entry.css.includes('id="visibleButton"')
    );

    expect(hasVisibleButton).toBe(true);
  }, 10000);

  it('should treat opacity 0.0 and variations as invisible', async () => {
    const fixturePath = `file://${fixturesPath}/visibility.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that buttons with opacity 0, 0.0, 0.00 are NOT in snapshot
    const hasOpacity0 = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('opacity0') && entry.css.includes('id="opacity0"')
    );
    const hasOpacity00 = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('opacity00') && entry.css.includes('id="opacity00"')
    );
    const hasOpacity000 = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('opacity000') && entry.css.includes('id="opacity000"')
    );

    expect(hasOpacity0).toBe(false);
    expect(hasOpacity00).toBe(false);
    expect(hasOpacity000).toBe(false);

    // Check that button with opacity 0.1 IS in snapshot
    const hasOpacity01 = snapshot.json.uidMap.some(
      (entry) => entry.css.includes('opacity01') || entry.css.includes('id="opacity01"')
    );

    expect(hasOpacity01).toBe(true);
  }, 10000);

  it('should exclude children of visibility hidden parents', async () => {
    const fixturePath = `file://${fixturesPath}/visibility.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that button inside visibility:hidden parent is NOT in snapshot
    const hasInvisibleButton = snapshot.json.uidMap.some(
      (entry) =>
        entry.css.includes('buttonInInvisibleDiv') ||
        entry.css.includes('id="buttonInInvisibleDiv"')
    );

    expect(hasInvisibleButton).toBe(false);
  }, 10000);
});
