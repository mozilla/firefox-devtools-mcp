/**
 * Integration tests for press_key
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGE =
  'data:text/html,<h1 id=h>Title</h1><input id=a><input id=b>' +
  '<form id=f onsubmit="document.title=\'submitted\';return false"><input id=c></form>';

interface KeyEvent {
  target: string;
  key: string;
  code: string;
  ctrl: boolean;
  shift: boolean;
}

describe('press_key Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  async function openPage(): Promise<void> {
    await firefox.navigate(PAGE);
    await firefox.evaluate(`
      window.__keys = [];
      document.addEventListener('keydown', (e) => {
        window.__keys.push({
          target: e.target.id,
          key: e.key,
          code: e.code,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
        });
      }, true);
    `);
  }

  async function recordedKeys(): Promise<KeyEvent[]> {
    return JSON.parse(String(await firefox.evaluate('JSON.stringify(window.__keys)')));
  }

  async function uidOf(id: string): Promise<string> {
    const node = await waitForElementInSnapshot(firefox, (n) => n.id === id, 10000);
    return node.uid;
  }

  it('should send exactly one keydown when targeting a uid', async () => {
    await openPage();

    await firefox.pressKey('Escape', await uidOf('a'));

    const keys = await recordedKeys();
    expect(keys).toEqual([
      { target: 'a', key: 'Escape', code: 'Escape', ctrl: false, shift: false },
    ]);
  }, 20000);

  it('should press the main Enter key rather than the numpad one', async () => {
    await openPage();

    await firefox.pressKey('Enter', await uidOf('c'));

    const keys = await recordedKeys();
    expect(keys.map((k) => k.code)).toEqual(['Enter']);
    expect(await firefox.evaluate('document.title')).toBe('submitted');
  }, 20000);

  it('should reach the numpad Enter under its own name', async () => {
    await openPage();

    await firefox.pressKey('NumpadEnter', await uidOf('c'));

    const keys = await recordedKeys();
    expect(keys.map((k) => k.code)).toEqual(['NumpadEnter']);
  }, 20000);

  it('should release modifiers after a combination', async () => {
    await openPage();

    await firefox.pressKey('ctrl+shift+b', await uidOf('a'));
    await firefox.pressKey('x');

    const keys = await recordedKeys();
    const last = keys[keys.length - 1];
    expect(last.key).toBe('x');
    expect(last.ctrl).toBe(false);
    expect(last.shift).toBe(false);
  }, 20000);

  it('should move focus with Tab', async () => {
    await openPage();

    await firefox.pressKey('Tab', await uidOf('a'));

    expect(await firefox.evaluate('document.activeElement.id')).toBe('b');
  }, 20000);

  it('should reject a uid that cannot take keyboard focus', async () => {
    await openPage();
    const uid = await uidOf('h');

    await expect(firefox.pressKey('Escape', uid)).rejects.toThrow(/cannot receive keyboard focus/);
    expect(await recordedKeys()).toEqual([]);
  }, 20000);
});
