/**
 * Integration tests for accept_dialog and dismiss_dialog
 * Tests with real Firefox browser in headless mode.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { McpToolResponse } from '@/types/common.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { handleAcceptDialog, handleDismissDialog } from '@/tools/utilities.js';
import { createTestFirefox, closeFirefox, waitFor } from '../helpers/firefox.js';

// The dialog tools resolve the browser through the server's global getFirefox(),
// so it is redirected to the Firefox instance launched by this test.
const testState = vi.hoisted(() => ({ firefox: null as FirefoxClient | null }));

vi.mock('../../src/index.js', () => ({
  getFirefox: async () => testState.firefox,
}));

const PAGE = 'data:text/html,<h1>dialogs</h1>';

function responseText(response: McpToolResponse): string {
  return response.content.map((item) => (item.text as string) ?? '').join('\n');
}

describe('Dialog Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    testState.firefox = firefox;
  });

  afterAll(async () => {
    testState.firefox = null;
    await closeFirefox(firefox);
  });

  async function evaluateString(expression: string): Promise<string> {
    return String(await firefox.evaluate(expression));
  }

  /**
   * Opens a dialog from a timer so the evaluation returns, then checks that
   * the page is still blocked in the dialog after the browser had time to
   * close it on its own.
   */
  async function openDialog(call: string): Promise<void> {
    await firefox.navigate(PAGE);
    await firefox.evaluate(
      `window.result = 'pending'; setTimeout(() => { window.result = ${call}; }, 50); 1`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await evaluateString('String(window.result)')).toBe('pending');
  }

  async function resultOnceSettled(): Promise<string> {
    await waitFor(async () => (await evaluateString('String(window.result)')) !== 'pending', 5000);
    return evaluateString('JSON.stringify(window.result)');
  }

  it('should leave a confirm open until it is accepted', async () => {
    await openDialog("confirm('Proceed?')");

    const response = await handleAcceptDialog({});

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe('Accepted');
    expect(await resultOnceSettled()).toBe('true');
  }, 30000);

  it('should leave a confirm open until it is dismissed', async () => {
    await openDialog("confirm('Proceed?')");

    const response = await handleDismissDialog({});

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe('Dismissed');
    expect(await resultOnceSettled()).toBe('false');
  }, 30000);

  it('should return the text given to accept_dialog from a prompt', async () => {
    await openDialog("prompt('Name?')");

    const response = await handleAcceptDialog({ promptText: 'Ada' });

    expect(response.isError).toBeUndefined();
    expect(await resultOnceSettled()).toBe('"Ada"');
  }, 30000);

  it('should return null from a prompt that is dismissed', async () => {
    await openDialog("prompt('Name?')");

    const response = await handleDismissDialog({});

    expect(response.isError).toBeUndefined();
    expect(await resultOnceSettled()).toBe('null');
  }, 30000);

  it('should report no active dialog when none is open', async () => {
    await firefox.navigate(PAGE);

    const accepted = await handleAcceptDialog({});
    const dismissed = await handleDismissDialog({});

    expect(accepted.isError).toBe(true);
    expect(responseText(accepted)).toBe('Error: No active dialog');
    expect(dismissed.isError).toBe(true);
    expect(responseText(dismissed)).toBe('Error: No active dialog');
  }, 30000);
});
