/**
 * Integration tests for upload_file_by_uid
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGE =
  'data:text/html,<input type=file id=single><input type=file id=multi multiple>' +
  '<input id=text>';

describe('upload_file_by_uid Integration Tests', () => {
  let firefox: FirefoxClient;
  let dir: string;
  let fileA: string;
  let fileB: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'upload-test-'));
    fileA = join(dir, 'a.txt');
    fileB = join(dir, 'b.txt');
    writeFileSync(fileA, 'a');
    writeFileSync(fileB, 'b');
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
    rmSync(dir, { recursive: true, force: true });
  });

  async function openPage(): Promise<void> {
    await firefox.navigate(PAGE);
    await firefox.evaluate(`
      window.__changes = [];
      document.addEventListener('change', (e) => {
        window.__changes.push({ target: e.target.id, files: [...e.target.files].map((f) => f.name) });
      }, true);
    `);
  }

  async function recordedChanges(): Promise<Array<{ target: string; files: string[] }>> {
    return JSON.parse(String(await firefox.evaluate('JSON.stringify(window.__changes)')));
  }

  async function uidOf(id: string): Promise<string> {
    const node = await waitForElementInSnapshot(firefox, (n) => n.id === id, 10000);
    return node.uid;
  }

  it('should set the file and fire a change event', async () => {
    await openPage();

    await firefox.uploadFileByUid(await uidOf('single'), fileA);

    expect(await recordedChanges()).toEqual([{ target: 'single', files: ['a.txt'] }]);
  }, 20000);

  it('should set newline-separated paths as one selection on a multiple input', async () => {
    await openPage();

    await firefox.uploadFileByUid(await uidOf('multi'), `${fileA}\n${fileB}`);

    expect(await recordedChanges()).toEqual([{ target: 'multi', files: ['a.txt', 'b.txt'] }]);
  }, 20000);

  it('should set the file on an input hidden after the snapshot', async () => {
    await openPage();
    const uid = await uidOf('single');
    await firefox.evaluate(`document.getElementById('single').style.display = 'none'`);

    await firefox.uploadFileByUid(uid, fileA);

    expect(await recordedChanges()).toEqual([{ target: 'single', files: ['a.txt'] }]);
  }, 20000);

  it('should reject an element that is not a file input', async () => {
    await openPage();

    await expect(firefox.uploadFileByUid(await uidOf('text'), fileA)).rejects.toThrow(
      'unable to set file input'
    );
  }, 20000);
});
