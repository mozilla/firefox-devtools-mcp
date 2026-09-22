/**
 * UID Resolver
 * Resolves UIDs by asking the content page for the element the UID was assigned to
 * during the snapshot (see injected/uidRegistry.ts)
 */

import type { BrowsingContext, Script } from 'webdriver-bidi-protocol';
import { BiDiFacade } from '../bidi.js';
import { nativeToLocalValue } from '../../utils/local-value.js';
import { logDebug } from '../../utils/logger.js';

const RESOLVE_SCRIPT = '(el) => window.__resolveUid ? window.__resolveUid(el) : null';
const SELECTOR_SCRIPT = '(el) => window.__uidToSelector ? window.__uidToSelector(el) : null';
const CLEAR_SCRIPT = 'if (window.__clearUidRegistry) { window.__clearUidRegistry(); }';

/**
 * UID Resolver class
 * Separated from SnapshotManager for better modularity
 */
export class UidResolver {
  constructor(private bidi: BiDiFacade) {}

  /**
   * Forget all UID associations in the page, making existing UIDs unresolvable.
   * Best effort: the registry dies with the page anyway.
   */
  async clear(context: BrowsingContext.BrowsingContext): Promise<void> {
    try {
      await this.bidi.evaluate(CLEAR_SCRIPT, context);
      logDebug('Snapshot UIDs cleared');
    } catch {
      logDebug('Unable to clear snapshot UIDs (page may be navigating)');
    }
  }

  /**
   * Resolve UID to a CSS selector, generated on demand from the element it points at
   */
  async resolveUidToSelector(
    context: BrowsingContext.BrowsingContext,
    uid: string
  ): Promise<string> {
    const selector = await this.bidi.callFunction<string | null>(context, SELECTOR_SCRIPT, [
      nativeToLocalValue(uid),
    ]);
    if (!selector) {
      throw new Error(notFoundMessage(uid));
    }

    return selector;
  }

  /**
   * Resolve UID to the element it was assigned to during the snapshot
   */
  async resolveUidToElement(
    context: BrowsingContext.BrowsingContext,
    uid: string
  ): Promise<Script.SharedReference> {
    const element = await this.bidi.callFunctionRaw(context, RESOLVE_SCRIPT, [
      nativeToLocalValue(uid),
    ]);
    if (element?.type !== 'node' || !element.sharedId) {
      throw new Error(notFoundMessage(uid));
    }

    logDebug(`Resolved element for UID: ${uid}`);
    return { sharedId: element.sharedId };
  }
}

function notFoundMessage(uid: string): string {
  return (
    `UID not found: ${uid}. The element is gone from the page, or the page was reloaded. ` +
    'Take a fresh snapshot first.'
  );
}
