/**
 * Integration tests for connecting to a Firefox that another client controls
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FirefoxCore } from '@/firefox/core.js';
import { findFirefoxBinaryWindows } from '@/firefox/windows-binary.js';
import { createTestFirefox, closeFirefox, fixtureUrl, waitFor } from '../../helpers/firefox.js';
import { removeDir } from '../../helpers/fs.js';
import type { FirefoxClient } from '@/firefox/index.js';

describe('Connect Existing Integration Tests', () => {
  let firefox: FirefoxClient;
  let marionettePort: number;

  beforeAll(async () => {
    // This launched Firefox already holds a WebDriver session.
    firefox = await createTestFirefox();
    const capabilities = await firefox.getDriver().getCapabilities();
    const profile = capabilities.get('moz:profile') as string;
    marionettePort = Number(readFileSync(join(profile, 'MarionetteActivePort'), 'utf-8').trim());
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should fail fast when another session holds Marionette', async () => {
    const core = new FirefoxCore({ connectExisting: true, marionettePort });
    const start = Date.now();
    try {
      await expect(core.connect()).rejects.toThrow(
        `Another WebDriver session is already active in Firefox on 127.0.0.1:${marionettePort}`
      );
    } finally {
      await core.close();
    }
    // Without the greeting check, geckodriver retries for about 60 seconds.
    expect(Date.now() - start).toBeLessThan(10000);
  }, 20000);
});

function findFirefoxBinary(): string {
  if (process.env.FIREFOX_PATH) {
    return process.env.FIREFOX_PATH;
  }
  if (process.platform === 'win32') {
    return findFirefoxBinaryWindows() ?? 'firefox';
  }
  const macBinary = '/Applications/Firefox.app/Contents/MacOS/firefox';
  if (process.platform === 'darwin' && existsSync(macBinary)) {
    return macBinary;
  }
  return 'firefox';
}

describe('Connect Existing Viewport Tests', () => {
  let firefoxProcess: ChildProcess | undefined;
  let profile: string;
  let marionettePort: number;

  beforeAll(async () => {
    // Started like a user would for --connect-existing, without a WebDriver session.
    profile = mkdtempSync(join(tmpdir(), 'connect-existing-'));
    writeFileSync(join(profile, 'user.js'), 'user_pref("marionette.port", 0);\n');
    firefoxProcess = spawn(
      findFirefoxBinary(),
      [
        '-headless',
        '-profile',
        profile,
        '--marionette',
        '--remote-debugging-port',
        '0',
        fixtureUrl('simple.html'),
      ],
      { stdio: 'ignore' }
    );
    const portFile = join(profile, 'MarionetteActivePort');
    await waitFor(
      () => existsSync(portFile) && readFileSync(portFile, 'utf-8').trim() !== '',
      30000
    );
    marionettePort = Number(readFileSync(portFile, 'utf-8').trim());
  });

  afterAll(() => {
    firefoxProcess?.kill('SIGKILL');
    removeDir(profile);
  });

  it('should find the port in the legacy instances folder', async () => {
    const home = mkdtempSync(join(tmpdir(), 'connect-existing-home-'));
    const instances = join(home, '.firefox-devtools-mcp', 'instances');
    mkdirSync(instances, { recursive: true });
    // Migrated data root, while Firefox still writes to the legacy one.
    mkdirSync(join(home, '.firefox-mcp'));
    writeFileSync(join(instances, `${firefoxProcess!.pid}.port`), String(marionettePort));
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = process.env.USERPROFILE = home;
    try {
      const firefox = await createTestFirefox({
        connectExisting: true,
        lookupMarionettePort: true,
      });
      try {
        expect(await firefox.evaluate('location.href')).toContain('simple.html');
      } finally {
        await closeFirefox(firefox);
      }
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      removeDir(home);
    }
  }, 60000);

  it('should reset the viewport when the session closes', async () => {
    const first = await createTestFirefox({ connectExisting: true, marionettePort });
    let originalSize: unknown;
    try {
      originalSize = await first.evaluate('[innerWidth, innerHeight]');
      await first.setViewportSize(400, 300);
      expect(await first.evaluate('[innerWidth, innerHeight]')).toEqual([400, 300]);
    } finally {
      await closeFirefox(first);
    }

    const second = await createTestFirefox({ connectExisting: true, marionettePort });
    try {
      expect(await second.evaluate('[innerWidth, innerHeight]')).toEqual(originalSize);
    } finally {
      await closeFirefox(second);
    }
  }, 60000);
});
