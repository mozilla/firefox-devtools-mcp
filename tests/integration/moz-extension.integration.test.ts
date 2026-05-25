/**
 * Integration tests for BiDi navigation
 * Tests with real Firefox browser in headless mode.
 *
 * Navigation uses BiDi browsingContext.navigate for all URLs.
 * Standard schemes (http/https/data/blob/file) use wait:"interactive".
 * Non-standard schemes (moz-extension:, about:) use wait:"none" because
 * the Remote Agent doesn't emit navigation completion events for
 * extension/privileged contexts.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createTestFirefox, closeFirefox, waitFor } from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');
const extensionDir = resolve(fixturesPath, 'test-extension');
const xpiPath = resolve(fixturesPath, 'test-extension.xpi');

function packExtension(): void {
  // Remove stale .xpi so zip creates a fresh archive
  if (existsSync(xpiPath)) {
    unlinkSync(xpiPath);
  }
  // Use execFileSync to avoid shell interpolation of paths
  execFileSync('zip', ['-j', xpiPath, 'manifest.json', 'popup.html'], {
    cwd: extensionDir,
    stdio: 'pipe',
  });
}

/**
 * Get the moz-extension:// hostname for an installed extension by switching
 * to a chrome-privileged context and querying WebExtensionPolicy.
 * Requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.
 */
async function getExtensionHostname(firefox: FirefoxClient, extensionId: string): Promise<string> {
  const treeResult = await firefox.sendBiDiCommand('browsingContext.getTree', {
    'moz:scope': 'chrome',
  });
  const contexts = treeResult.contexts || [];
  if (contexts.length === 0) {
    throw new Error('No chrome contexts available');
  }

  const driver = firefox.getDriver();
  const originalContextId = firefox.getCurrentContextId();
  const chromeContextId = contexts[0].context;

  try {
    await driver.switchTo().window(chromeContextId);
    await driver.setContext('chrome');

    const hostname = await driver.executeAsyncScript(`
      const callback = arguments[arguments.length - 1];
      const extensionId = ${JSON.stringify(extensionId)};
      (async () => {
        try {
          const policy = WebExtensionPolicy.getByID(extensionId);
          callback(policy ? policy.mozExtensionHostname : '');
        } catch { callback(''); }
      })();
    `);

    if (!hostname) {
      throw new Error(
        `Could not resolve hostname for extension ${extensionId}, got: ${JSON.stringify(hostname)}`
      );
    }
    return hostname as string;
  } finally {
    try {
      await driver.setContext('content');
      if (originalContextId) {
        await driver.switchTo().window(originalContextId);
      }
    } catch (e) {
      console.warn('Failed to restore context after getExtensionHostname:', e);
    }
  }
}

/**
 * Race a promise against a timeout. Resolves 'ok' on success, 'timeout' if
 * the timeout fires, or rejects with the original error.
 */
function raceWithTimeout(promise: Promise<any>, ms: number): Promise<'ok' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.then(
      () => 'ok' as const,
      (e: any) => {
        throw e;
      }
    ),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

describe('BiDi Navigation Integration Tests', () => {
  let firefox: FirefoxClient;
  let extensionUrl: string;
  let extensionId: string;

  beforeAll(async () => {
    packExtension();

    // MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 is required to resolve the extension hostname
    firefox = await createTestFirefox({
      env: { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
    });

    // Install the test extension
    const installResult = await firefox.sendBiDiCommand('webExtension.install', {
      extensionData: { type: 'archivePath', path: xpiPath },
    });
    extensionId = installResult?.extension;
    if (!extensionId) {
      throw new Error(`Extension install returned no ID, got: ${JSON.stringify(installResult)}`);
    }

    // Resolve the moz-extension:// URL from the extension hostname
    const hostname = await getExtensionHostname(firefox, extensionId);
    extensionUrl = `moz-extension://${hostname}/popup.html`;
  }, 60000);

  afterAll(async () => {
    // Uninstall the test extension to avoid accumulation across test runs
    if (extensionId) {
      try {
        await firefox.sendBiDiCommand('webExtension.uninstall', { extension: extensionId });
      } catch {}
    }
    await closeFirefox(firefox);
    // Remove the packed .xpi so no build artifact remains on disk
    if (existsSync(xpiPath)) {
      unlinkSync(xpiPath);
    }
  });

  // Reset to a clean state between tests
  afterEach(async () => {
    try {
      await firefox.navigate('about:blank');
    } catch {
      // Best-effort reset
    }
  });

  it('should navigate to moz-extension:// URL without hanging', async () => {
    // Non-standard schemes use wait:"none" because the Remote Agent
    // doesn't emit navigation completion events for extension contexts.
    // A 5s timeout proves no hang while tolerating slow CI.
    const result = await raceWithTimeout(firefox.navigate(extensionUrl), 5000);

    expect(result).toBe('ok');

    // Poll for the page URL since wait:none returns before the page loads
    const driver = firefox.getDriver();
    await waitFor(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes('moz-extension://');
    }, 5000);

    const title = await driver.getTitle();
    expect(title).toBe('MCP Test Extension');
  }, 15000);

  it('should create new page with moz-extension:// URL without hanging', async () => {
    const result = await raceWithTimeout(
      firefox.createNewPage(extensionUrl).then((idx: number) => idx),
      5000
    );

    expect(result).toBe('ok');

    // Poll for the page URL since wait:none returns before the page loads
    const driver = firefox.getDriver();
    await waitFor(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes('moz-extension://');
    }, 5000);

    const title = await driver.getTitle();
    expect(title).toBe('MCP Test Extension');

    // Clean up the created tab
    try {
      const handles = await driver.getAllWindowHandles();
      if (handles.length > 1) {
        await driver.close();
        const remaining = await driver.getAllWindowHandles();
        if (remaining.length > 0) {
          await driver.switchTo().window(remaining[0]!);
        }
      }
    } catch {
      // Best-effort cleanup
    }
  }, 15000);
});
