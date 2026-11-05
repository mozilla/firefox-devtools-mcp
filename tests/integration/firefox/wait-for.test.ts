/**
 * Integration tests for waiting on page content
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestFirefox, closeFirefox } from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGE =
  'data:text/html,<div id=slot></div><p id=old>Loading</p><x-box></x-box><script>' +
  'setTimeout(() => { slot.innerHTML = "<button id=late>Late</button>"; old.remove(); }, 500);' +
  'customElements.define("x-box", class extends HTMLElement { connectedCallback() {' +
  ' const root = this.attachShadow({ mode: "open" });' +
  ' setTimeout(() => { root.innerHTML = "<span>Deep text</span>"; }, 500); } });</script>';

describe('waitFor Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should wait until an element matching the selector appears', async () => {
    await firefox.navigate(PAGE);

    await firefox.waitFor({ selector: '#late' });

    expect(await firefox.evaluate('!!document.getElementById("late")')).toBe(true);
  }, 10000);

  it('should wait until text appears inside an open shadow root', async () => {
    await firefox.navigate(PAGE);

    await firefox.waitFor({ text: 'Deep text' });

    expect(await firefox.evaluate('document.querySelector("x-box").shadowRoot.textContent')).toBe(
      'Deep text'
    );
  }, 10000);

  it('should wait until the text is gone', async () => {
    await firefox.navigate(PAGE);

    await firefox.waitFor({ text: 'Loading', gone: true });

    expect(await firefox.evaluate('!!document.getElementById("old")')).toBe(false);
  }, 10000);

  it('should fail after the timeout and name what it waited for', async () => {
    await firefox.navigate(PAGE);

    await expect(firefox.waitFor({ selector: '#never', timeout: 300 })).rejects.toThrow(/#never/);
  }, 10000);

  it('should reject an invalid selector without waiting for the timeout', async () => {
    await firefox.navigate(PAGE);
    const started = Date.now();

    await expect(firefox.waitFor({ selector: 'div[', timeout: 5000 })).rejects.toThrow(
      /not a valid selector/
    );
    expect(Date.now() - started).toBeLessThan(2000);
  }, 10000);
});
