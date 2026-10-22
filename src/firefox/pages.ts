/**
 * Page/Tab/Window management
 */

import { randomUUID } from 'node:crypto';
import { WebDriver } from 'selenium-webdriver';
import type { BrowsingContext, Script } from 'webdriver-bidi-protocol';
import { ReadinessState, type BiDiFacade } from './bidi.js';
import { log, logDebug } from '../utils/logger.js';

const COMMON_URL_SCHEMES = ['http:', 'https:', 'data:', 'blob:', 'file:'];
const PAGES_SANDBOX = 'page-management';
// script.evaluate cannot answer while the content process is busy, so a hung tab must not block the whole tab list
const TITLE_TIMEOUT_MS = 1000;
// Set in the sandbox before a history traversal, to detect when another document is active
const HISTORY_MARKER = '__mcpHistoryMarker';
// Set by a popstate listener in the sandbox, to detect same-document traversals
const HISTORY_POPSTATE = '__mcpHistoryPopstate';
// A hung page must not block navigating away from it
const HISTORY_EVALUATE_TIMEOUT_MS = 1000;
const HISTORY_WAIT_TIMEOUT_MS = 10000;
const HISTORY_POLL_INTERVAL_MS = 50;

/**
 * Check if a URL uses a common scheme that supports load events.
 * Non-common schemes = moz-extension:, about:, ...
 */
export function isCommonScheme(url: string): boolean {
  try {
    return COMMON_URL_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * WebDriver BiDi browsingContext.ReadinessState.
 * - "none": return as soon as navigation starts
 * - "interactive": wait for DOMContentLoaded
 * - "complete": wait for the load event, including subresources
 */
export const READINESS_STATES = [...Object.values(ReadinessState)];

export function isReadinessState(value: unknown): value is BrowsingContext.ReadinessState {
  return READINESS_STATES.includes(value as BrowsingContext.ReadinessState);
}

export class PageManagement {
  constructor(
    private driver: WebDriver,
    private getCurrentContextId: () => string | null,
    private setCurrentContextId: (id: string) => void,
    private sendBiDiCommand: BiDiFacade['sendCommand']
  ) {}

  /**
   * Navigate to URL using BiDi
   *
   * @param url - Target URL
   * @param waitOverride - Explicit readiness state to wait for. When omitted,
   *   common schemes wait for "interactive" and uncommon schemes do not wait.
   */
  async navigate(url: string, waitOverride?: BrowsingContext.ReadinessState): Promise<void> {
    const contextId = this.getCurrentContextId();
    if (!contextId) {
      throw new Error(`Cannot navigate: no browsing context ID`);
    }

    // Default wait time is "interactive" (DOMContentLoaded).
    // All uncommon schemes use wait time "none".
    // An explicit override is honoured for every scheme: silently downgrading it
    // would discard what the caller asked for with no way to tell.
    const wait =
      waitOverride ?? (isCommonScheme(url) ? ReadinessState.Interactive : ReadinessState.None);

    // Navigate using direct BiDi
    await this.sendBiDiCommand('browsingContext.navigate', {
      context: contextId,
      url,
      wait,
    });

    logDebug(`BiDi navigate (wait:${wait}) to: ${url}`);
    log(`Navigated to: ${url}`);
  }

  /**
   * Navigate back in history
   */
  async navigateBack(): Promise<void> {
    await this.#traverseHistory(-1);
  }

  /**
   * Navigate forward in history
   */
  async navigateForward(): Promise<void> {
    await this.#traverseHistory(1);
  }

  /**
   * Set viewport size
   */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.driver.manage().window().setRect({ width, height });
  }

  /**
   * Accept dialog (alert/confirm/prompt)
   * @param promptText - Optional text to enter in prompt dialog
   */
  async acceptDialog(promptText?: string): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      if (promptText !== undefined) {
        await alert.sendKeys(promptText);
      }
      await alert.accept();
    } catch (error) {
      throw new Error(
        `Failed to accept dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Dismiss dialog (alert/confirm/prompt)
   */
  async dismissDialog(): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      await alert.dismiss();
    } catch (error) {
      throw new Error(
        `Failed to dismiss dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private cachedTabs: Array<{ actor: string; title: string; url: string }> = [];
  private cachedSelectedIdx: number = 0;

  /**
   * Get all tabs (window handles)
   */
  getTabs(): Array<{ actor: string; title: string; url: string }> {
    return this.cachedTabs;
  }

  /**
   * Get selected tab index
   */
  getSelectedTabIdx(): number {
    return this.cachedSelectedIdx;
  }

  /**
   * Refresh tabs metadata - fetches all top-level browsing contexts and their URLs/titles
   */
  async refreshTabs(): Promise<void> {
    try {
      const { contexts } = await this.sendBiDiCommand('browsingContext.getTree', { maxDepth: 0 });

      this.cachedTabs = await Promise.all(
        contexts.map(async ({ context, url }) => ({
          actor: context,
          title: await this.getTitle(context),
          url: url || 'about:blank',
        }))
      );
      const currentId = this.getCurrentContextId();
      this.cachedSelectedIdx = Math.max(
        0,
        this.cachedTabs.findIndex((tab) => tab.actor === currentId)
      );
    } catch (error) {
      log(`Error refreshing tabs: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback to single tab
      const currentId = this.getCurrentContextId();
      this.cachedTabs = [
        {
          actor: currentId || '',
          title: 'Current Tab',
          url: '',
        },
      ];
      this.cachedSelectedIdx = 0;
    }
  }

  private async getTitle(context: string): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.sendBiDiCommand('script.evaluate', {
          expression: 'document.title',
          awaitPromise: false,
          target: { context, sandbox: PAGES_SANDBOX },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out')), TITLE_TIMEOUT_MS);
        }),
      ]);
      if (result.type === 'success' && result.result.type === 'string') {
        return result.result.value || 'Untitled';
      }
      return 'Untitled';
    } catch (error) {
      logDebug(
        `Failed to fetch title of tab ${context}: ${error instanceof Error ? error.message : String(error)}`
      );
      return '(unknown)';
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Select tab by index
   */
  async selectTab(index: number): Promise<void> {
    const handle = this.cachedTabs[index]?.actor;
    if (handle) {
      await this.driver.switchTo().window(handle);
      this.setCurrentContextId(handle);
      this.cachedSelectedIdx = index;
    }
  }

  /**
   * Create new page (tab)
   */
  async createNewPage(url: string, waitOverride?: BrowsingContext.ReadinessState): Promise<number> {
    await this.driver.switchTo().newWindow('tab');
    this.setCurrentContextId(await this.driver.getWindowHandle());
    await this.navigate(url, waitOverride);
    await this.refreshTabs();
    return this.cachedSelectedIdx;
  }

  /**
   * Close tab by index
   */
  async closeTab(index: number): Promise<void> {
    const handle = this.cachedTabs[index]?.actor;
    if (handle) {
      await this.driver.switchTo().window(handle);
      await this.driver.close();
      this.cachedTabs = this.cachedTabs.filter((tab) => tab.actor !== handle);
      const next = this.cachedTabs[0]?.actor;
      if (next) {
        await this.driver.switchTo().window(next);
        this.setCurrentContextId(next);
        this.cachedSelectedIdx = 0;
      }
    }
  }

  async #traverseHistory(delta: number): Promise<void> {
    const contextId = this.getCurrentContextId();
    if (!contextId) {
      throw new Error(`Cannot navigate: no browsing context ID`);
    }

    const target = { context: contextId, sandbox: PAGES_SANDBOX };
    const token = randomUUID();
    const tokenString = JSON.stringify(token);

    // Tag the current document with a unique token, and set the same token in a
    // popstate listener. After the traversal, a missing marker means another
    // document is active.
    const markerSet = await this.#evaluateWithTimeout(
      target,
      `window.${HISTORY_MARKER} = ${tokenString};
      window.addEventListener('popstate', () => { window.${HISTORY_POPSTATE} = ${tokenString}; }, { once: true });
      true`
    );

    try {
      await this.sendBiDiCommand('browsingContext.traverseHistory', {
        context: contextId,
        delta,
      });
    } catch (error) {
      // Firefox gives up after 1s when the target page is slow to respond, but
      // the traversal still goes on. Keep waiting for it below.
      if (!(error instanceof Error) || !error.message.includes('History was not updated')) {
        throw error;
      }
      logDebug(`Ignoring traverseHistory timeout in ${contextId}: ${error.message}`);
    }

    if (markerSet !== true) {
      return;
    }

    // Note: WebDriverBiDi.traverseHistory does not match WebDriver Classic's
    // wait logic for the Back/Forward commands, and does not expose enough
    // events to emulate it either. See w3c/webdriver-bidi#1019 and
    // w3c/webdriver-bidi#1092.
    const status = `(() => {
      // The marker is still there: the traversal stays in the same document
      // (pushState or fragment entries), and is done when popstate fired.
      if (window.${HISTORY_MARKER} === ${tokenString}) {
        return window.${HISTORY_POPSTATE} === ${tokenString} ? 'done' : 'pending';
      }

      // Another document is active. Error pages never reach "complete": like
      // Classic, they end the wait with an error.
      if (/^about:[^?]*error\\?/.test(document.documentURI)) {
        return 'error';
      }

      // about:blocked (Safe Browsing) never reaches "complete" either: like
      // Classic, it ends the wait normally.
      if (document.documentURI.startsWith('about:blocked?')) {
        return 'done';
      }

      return document.readyState === 'complete' ? 'done' : 'pending';
    })()`;
    const deadline = Date.now() + HISTORY_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = await this.#evaluateWithTimeout(target, status);
      if (result === 'error') {
        const uri = await this.#evaluateWithTimeout(target, 'document.documentURI');
        throw new Error(`Reached error page: ${String(uri)}`);
      }
      if (result === 'done') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, HISTORY_POLL_INTERVAL_MS));
    }

    // Bug 2081596: Tell the agent in the tool response that the traversal could
    // not be confirmed, so it can check the page state itself.
    logDebug(`Timed out waiting for history traversal in ${contextId}`);
  }

  /**
   * Evaluate an expression and return its primitive value, or null when the
   * evaluation fails or does not answer within HISTORY_EVALUATE_TIMEOUT_MS.
   * Bug 2084899: Replace with a timeout option on sendCommand.
   */
  async #evaluateWithTimeout(target: Script.ContextTarget, expression: string): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.sendBiDiCommand('script.evaluate', { expression, awaitPromise: false, target }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out')), HISTORY_EVALUATE_TIMEOUT_MS);
        }),
      ]);
      if (result.type === 'success' && 'value' in result.result) {
        return result.result.value;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
