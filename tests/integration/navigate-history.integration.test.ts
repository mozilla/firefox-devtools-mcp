/**
 * Integration tests for navigation using traverse history.
 * Tests with real Firefox browser in headless mode.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestFirefox, closeFirefox, fixtureUrl, waitFor } from '../helpers/firefox.js';
import { ReadinessState } from '@/firefox/bidi.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGES: Record<string, { headers?: Record<string, string>; body: string; delayMs?: number }> =
  {
    '/cached': {
      body: `<script>addEventListener('pageshow', (e) => { window.restored = e.persisted; });</script>`,
    },
    // no-store keeps the page out of the bfcache, and the slow script delays DOMContentLoaded
    '/uncached': {
      headers: { 'Cache-Control': 'no-store' },
      body: `<script src="/slow.js"></script>`,
    },
    '/slow.js': {
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript' },
      body: 'window.slowScriptRan = true;',
      delayMs: 1000,
    },
    // The slow image delays the load event, but not DOMContentLoaded
    '/slow-subresource': {
      headers: { 'Cache-Control': 'no-store' },
      body: `<img src="/slow.png">`,
    },
    '/slow.png': {
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'image/png' },
      body: '',
      delayMs: 1000,
    },
    '/other': { body: '<p>other</p>' },
  };

describe('Traverse History Integration Tests', () => {
  let firefox: FirefoxClient;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const page = PAGES[req.url ?? ''];
      if (!page) {
        res.writeHead(404).end();
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html', ...page.headers }).end(page.body);
      }, page.delayMs ?? 0);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
    await new Promise((resolve) => server?.close(resolve));
  });

  it('should go back and forward', async () => {
    const page1 = fixtureUrl('form.html');
    const page2 = fixtureUrl('simple.html');

    await firefox.navigate(page1, ReadinessState.Complete);
    await firefox.navigate(page2, ReadinessState.Complete);

    // Navigate back to the first page.
    await firefox.navigateBack();
    expect(await firefox.evaluate('window.location.href')).toBe(page1);

    // Check that navigating back on the first page rejects.
    await expect(firefox.navigateBack()).rejects.toThrow('no such history entry');

    // Navigate forward to the second page.
    await firefox.navigateForward();
    expect(await firefox.evaluate('window.location.href')).toBe(page2);

    // Check that navigating forward on the last page rejects.
    await expect(firefox.navigateForward()).rejects.toThrow('no such history entry');
  }, 15000);

  it('should wait for a page restored from the bfcache', async () => {
    await firefox.navigate(`${origin}/cached`, ReadinessState.Complete);
    await firefox.navigate(`${origin}/other`, ReadinessState.Complete);

    const start = Date.now();
    await firefox.navigateBack();
    expect(Date.now() - start).toBeLessThan(5000);
    expect(await firefox.evaluate('window.location.href')).toBe(`${origin}/cached`);
    expect(await firefox.evaluate('window.restored')).toBe(true);
  }, 15000);

  it('should wait for a page that is not in the bfcache', async () => {
    await firefox.navigate(`${origin}/uncached`, ReadinessState.Complete);
    await firefox.navigate(`${origin}/other`, ReadinessState.Complete);

    await firefox.navigateBack();
    expect(await firefox.evaluate('window.location.href')).toBe(`${origin}/uncached`);
    expect(await firefox.evaluate('window.slowScriptRan')).toBe(true);
  }, 15000);

  it('should wait for slow subresources to load', async () => {
    await firefox.navigate(`${origin}/slow-subresource`, ReadinessState.Complete);
    await firefox.navigate(`${origin}/other`, ReadinessState.Complete);

    await firefox.navigateBack();
    expect(await firefox.evaluate('window.location.href')).toBe(`${origin}/slow-subresource`);
    expect(await firefox.evaluate('document.readyState')).toBe('complete');
  }, 15000);

  it('should reject when the history entry loads an error page', async () => {
    // Reset the connection instead of closing the server: connecting to a
    // closed port takes seconds on Windows.
    let fail = false;
    const flakyServer = createServer((req, res) => {
      if (fail) {
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end();
    });
    await new Promise<void>((resolve) => flakyServer.listen(0, '127.0.0.1', resolve));
    const flakyUrl = `http://127.0.0.1:${(flakyServer.address() as AddressInfo).port}/`;

    try {
      await firefox.navigate(flakyUrl, ReadinessState.Complete);
      await firefox.navigate(`${origin}/other`, ReadinessState.Complete);
      fail = true;

      const start = Date.now();
      await expect(firefox.navigateBack()).rejects.toThrow('Reached error page: about:neterror');
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      flakyServer.closeAllConnections();
      await new Promise((resolve) => flakyServer.close(resolve));
    }
  }, 15000);

  it('should wait for a page that is slow to respond', async () => {
    // Firefox's traverseHistory times out after 1s while the traversal goes on.
    let delayMs = 0;
    const slowServer = createServer((_, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end();
      }, delayMs);
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const slowUrl = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}/`;

    try {
      await firefox.navigate(slowUrl, ReadinessState.Complete);
      await firefox.navigate(`${origin}/other`, ReadinessState.Complete);
      delayMs = 2000;

      await firefox.navigateBack();
      expect(await firefox.evaluate('window.location.href')).toBe(slowUrl);
      expect(await firefox.evaluate('document.readyState')).toBe('complete');
    } finally {
      slowServer.closeAllConnections();
      await new Promise((resolve) => slowServer.close(resolve));
    }
  }, 15000);

  it.each([
    ['a fragment entry', 'location.hash = "entry"'],
    ['a pushState entry', 'history.pushState({ entry: true }, "", "/other/route")'],
    [
      'a pushState entry with the same URL',
      'history.pushState({ entry: true }, "", location.href)',
    ],
  ])(
    'should not wait for the timeout when leaving %s',
    async (_, createEntry) => {
      await firefox.navigate(`${origin}/other`, ReadinessState.Complete);
      await firefox.evaluate(createEntry);

      const start = Date.now();
      await firefox.navigateBack();
      expect(Date.now() - start).toBeLessThan(5000);
      expect(await firefox.evaluate('window.location.href')).toBe(`${origin}/other`);
      expect(await firefox.evaluate('history.state')).toBe(null);
    },
    15000
  );
});

describe('Traverse History Integration Tests with Safe Browsing', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox({
      prefs: { 'browser.safebrowsing.phishing.enabled': true },
    });
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should not wait for the timeout when going back to about:blocked', async () => {
    // Built-in Safe Browsing test entry, blocked without any network access
    const trap = 'http://itisatrap.org/firefox/its-a-trap.html';
    await expect(firefox.navigate(trap, ReadinessState.None)).rejects.toThrow(
      'NS_ERROR_PHISHING_URI'
    );
    await waitFor(async () =>
      String(await firefox.evaluate('document.documentURI')).startsWith('about:blocked?')
    );
    await firefox.navigate(fixtureUrl('simple.html'), ReadinessState.Complete);

    const start = Date.now();
    await firefox.navigateBack();
    expect(Date.now() - start).toBeLessThan(5000);
    expect(await firefox.evaluate('document.documentURI')).toMatch(/^about:blocked\?/);
  }, 15000);
});
