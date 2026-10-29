/**
 * Integration tests for fill_by_uid
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

// #r and #rt keep their own state and write it back on focus, as a controlled
// input does when the framework re-renders on focus.
const PAGE =
  'data:text/html,<input id=a value=old><textarea id=t>old text</textarea>' +
  '<div id=ce contenteditable>old</div><input id=r><textarea id=rt></textarea>' +
  '<script>for (const el of [r, rt]) { let state = "old"; el.value = state;' +
  ' el.addEventListener("input", () => { state = el.value; });' +
  ' el.addEventListener("focus", () => { el.value = state; }); }</script>';

describe('fill_by_uid Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  async function valueOf(id: string): Promise<string> {
    return String(
      await firefox.evaluate(
        `(() => { const el = document.getElementById('${id}'); return el.isContentEditable ? el.textContent : el.value; })()`
      )
    );
  }

  async function uidOf(id: string): Promise<string> {
    const node = await waitForElementInSnapshot(firefox, (n) => n.id === id, 10000);
    return node.uid;
  }

  it('should replace the existing value of inputs, textareas and contenteditables', async () => {
    await firefox.navigate(PAGE);

    await firefox.fillByUid(await uidOf('a'), 'new');
    await firefox.fillByUid(await uidOf('t'), 'new text');
    await firefox.fillByUid(await uidOf('ce'), 'new');

    expect(await valueOf('a')).toBe('new');
    expect(await valueOf('t')).toBe('new text');
    expect(await valueOf('ce')).toBe('new');
  }, 20000);

  it('should replace the value of a field that writes its state back on focus', async () => {
    await firefox.navigate(PAGE);

    await firefox.fillByUid(await uidOf('r'), 'new');
    await firefox.fillByUid(await uidOf('rt'), 'new text');

    expect(await valueOf('r')).toBe('new');
    expect(await valueOf('rt')).toBe('new text');
  }, 20000);

  it('should clear a field that writes its state back on focus when filled with an empty string', async () => {
    await firefox.navigate(PAGE);

    await firefox.fillByUid(await uidOf('r'), '');
    await firefox.fillByUid(await uidOf('a'), 'focus moved away');

    expect(await valueOf('r')).toBe('');
  }, 20000);
});
