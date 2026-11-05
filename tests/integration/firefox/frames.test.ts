/**
 * Integration tests for UID input inside same-origin iframes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestFirefox, closeFirefox, findNodeInSnapshot } from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGES: Record<string, string> = {
  '/': '<h1>Top</h1><iframe id=frame src=/frame style="margin-top:200px"></iframe>',
  '/frame':
    '<input id=inner><button id=innerBtn onclick="out.textContent = inner.value">Go</button>' +
    '<output id=out></output>',
};

describe('UID input in iframes', () => {
  let firefox: FirefoxClient;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const body = PAGES[req.url ?? ''];
      res.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'text/html' }).end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
    await new Promise((resolve) => server.close(resolve));
  });

  async function openPage(): Promise<void> {
    await firefox.navigate(`${origin}/`);
    await firefox.evaluate(
      'new Promise((r) => { const f = document.getElementById("frame"); f.contentDocument?.getElementById("inner") ? r() : f.addEventListener("load", r); })'
    );
  }

  async function uidOf(id: string): Promise<string> {
    const snapshot = await firefox.takeSnapshot();
    return findNodeInSnapshot(snapshot.json.root, (node) => node.id === id)!.uid;
  }

  function frameValue(expression: string): Promise<unknown> {
    return firefox.evaluate(`document.getElementById("frame").contentDocument.${expression}`);
  }

  it('should include the elements of the iframe in a default snapshot', async () => {
    await openPage();

    const snapshot = await firefox.takeSnapshot();

    expect(findNodeInSnapshot(snapshot.json.root, (node) => node.id === 'innerBtn')?.name).toBe(
      'Go'
    );
  }, 20000);

  it('should fill and click elements inside the iframe by UID', async () => {
    await openPage();

    await firefox.fillByUid(await uidOf('inner'), 'abc');
    await firefox.clickByUid(await uidOf('innerBtn'));

    expect(await frameValue('getElementById("out").textContent')).toBe('abc');
  }, 20000);

  it('should focus an element inside the iframe for press_key', async () => {
    await openPage();

    await firefox.pressKey('x', await uidOf('inner'));

    expect(await frameValue('getElementById("inner").value')).toBe('x');
  }, 20000);
});
