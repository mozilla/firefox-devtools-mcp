/**
 * Integration tests for snapshot workflow
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
  findNodeInSnapshot,
  findNodesInSnapshot,
  waitForPageLoad,
  fixtureUrl,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import type { SnapshotNode } from '@/firefox/snapshot/types.js';

describe('Snapshot Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should take snapshot and generate UIDs', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.json).toBeDefined();
    expect(snapshot.json.root).toBeDefined();
    expect(snapshot.text).toBeDefined();
    expect(snapshot.text.length).toBeGreaterThan(0);
  }, 10000);

  it('should resolve UID to selector', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for button to appear in snapshot
    const buttonUid = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'clickBtn',
      10000
    );

    expect(buttonUid).toBeDefined();

    const selector = await firefox.resolveUidToSelector(buttonUid.uid);
    expect(selector).toBeDefined();
    expect(typeof selector).toBe('string');
  }, 10000);

  it('should click element by UID', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for button to appear in snapshot
    const buttonUid = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'clickBtn',
      10000
    );

    expect(buttonUid).toBeDefined();

    // Click button - should not throw
    await expect(firefox.clickByUid(buttonUid.uid)).resolves.not.toThrow();
  }, 10000);

  it('should detect stale UIDs after navigation', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot1 = await firefox.takeSnapshot();
    const firstUid = snapshot1.json.root.uid;

    expect(firstUid).toBeDefined();

    // Navigate to different page
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Old UID should be stale or not found
    if (firstUid) {
      await expect(firefox.clickByUid(firstUid)).rejects.toThrow(/(stale snapshot|UID not found)/);
    }
  }, 10000);

  it('should assign fresh UIDs after navigation', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot1 = await firefox.takeSnapshot();

    // Navigate to same page
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot2 = await firefox.takeSnapshot();

    // The registry died with the old page, so the new snapshot must not reuse its UIDs
    const uids = (root: SnapshotNode) => findNodesInSnapshot(root, () => true).map((n) => n.uid);
    const uids1 = new Set(uids(snapshot1.json.root));
    expect(uids(snapshot2.json.root).some((uid) => uids1.has(uid))).toBe(false);
  }, 10000);

  it('should handle double-click by UID', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for double-click button to appear in snapshot
    const dblClickBtnUid = await waitForElementInSnapshot(
      firefox,
      (node) => node.id === 'dblClickBtn',
      10000
    );

    expect(dblClickBtnUid).toBeDefined();

    // Double-click button - should not throw
    await expect(firefox.clickByUid(dblClickBtnUid.uid, true)).resolves.not.toThrow();
  }, 10000);

  it('should clear snapshot manually', async () => {
    const fixturePath = fixtureUrl('simple.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();
    const firstUid = snapshot.json.root.uid;

    expect(firstUid).toBeDefined();

    // Clear snapshot manually
    await firefox.clearSnapshot();

    // UID should be stale after manual clear
    if (firstUid) {
      await expect(firefox.clickByUid(firstUid)).rejects.toThrow();
    }
  }, 10000);

  it('should return clear error for invalid CSS selector', async () => {
    const fixturePath = fixtureUrl('selector.html');
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
    const fixturePath = fixtureUrl('visibility.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Take snapshot with includeAll mode
    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that elements inside hidden parent are NOT in snapshot
    const hasHiddenButton =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'buttonInHiddenDiv') !==
      undefined;
    const hasHiddenText =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'textInHiddenDiv') !== undefined;

    expect(hasHiddenButton).toBe(false);
    expect(hasHiddenText).toBe(false);

    // Check that visible elements ARE in snapshot
    const hasVisibleButton =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'visibleButton') !== undefined;

    expect(hasVisibleButton).toBe(true);
  }, 10000);

  it('should treat opacity 0.0 and variations as invisible', async () => {
    const fixturePath = fixtureUrl('visibility.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that buttons with opacity 0, 0.0, 0.00 are NOT in snapshot
    const hasOpacity0 =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'opacity0') !== undefined;
    const hasOpacity00 =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'opacity00') !== undefined;
    const hasOpacity000 =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'opacity000') !== undefined;

    expect(hasOpacity0).toBe(false);
    expect(hasOpacity00).toBe(false);
    expect(hasOpacity000).toBe(false);

    // Check that button with opacity 0.1 IS in snapshot
    const hasOpacity01 =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'opacity01') !== undefined;

    expect(hasOpacity01).toBe(true);
  }, 10000);

  it('should exclude children of visibility hidden parents', async () => {
    const fixturePath = fixtureUrl('visibility.html');
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot({ includeAll: true });

    // Check that button inside visibility:hidden parent is NOT in snapshot
    const hasInvisibleButton =
      findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'buttonInInvisibleDiv') !==
      undefined;

    expect(hasInvisibleButton).toBe(false);
  }, 10000);
});
