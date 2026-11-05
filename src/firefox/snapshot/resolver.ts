/**
 * UID Resolver
 * Resolves UIDs by asking the content page for the element the UID was assigned to
 * during the snapshot (see injected/uidRegistry.ts)
 */

import type { BrowsingContext, Script } from 'webdriver-bidi-protocol';
import { SNAPSHOT_MANAGER_SANDBOX } from './manager.js';
import { BiDiFacade } from '../bidi.js';
import { nativeToLocalValue } from '../../utils/local-value.js';
import { logDebug } from '../../utils/logger.js';

const RESOLVE_SCRIPT = '(el) => window.__resolveUid ? window.__resolveUid(el) : null';
const SELECTOR_SCRIPT = '(el) => window.__uidToSelector ? window.__uidToSelector(el) : null';
const CLEAR_SCRIPT = 'if (window.__clearUidRegistry) { window.__clearUidRegistry(); }';
// Index of each frame on the way from the top window down to the element, in document order like
// the children of a browsing context tree.
const FRAME_PATH_SCRIPT = `(uid) => {
  const el = window.__resolveUid ? window.__resolveUid(uid) : null;
  const path = [];
  for (let win = el?.ownerDocument.defaultView; win && win !== window; win = win.parent) {
    let index = 0;
    while (win.parent[index] !== win) {
      index++;
    }
    path.unshift(index);
  }
  return path;
}`;

export interface ResolvedElement {
  /** Browsing context of the document that holds the element */
  context: BrowsingContext.BrowsingContext;
  element: Script.SharedReference;
}

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
      await this.bidi.evaluate(context, CLEAR_SCRIPT, SNAPSHOT_MANAGER_SANDBOX);
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
    const selector = await this.bidi.callFunction<string | null>(
      context,
      SELECTOR_SCRIPT,
      [nativeToLocalValue(uid)],
      SNAPSHOT_MANAGER_SANDBOX
    );
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
    const element = await this.bidi.callFunctionRaw(
      context,
      RESOLVE_SCRIPT,
      [nativeToLocalValue(uid)],
      SNAPSHOT_MANAGER_SANDBOX
    );
    if (element?.type !== 'node' || !element.sharedId) {
      throw new Error(notFoundMessage(uid));
    }

    logDebug(`Resolved element for UID: ${uid}`);
    return { sharedId: element.sharedId };
  }

  /**
   * Resolve UID to its element together with the browsing context that owns it. A node from a
   * same-origin iframe can only be used in the context of that iframe.
   */
  async resolveUidToContextElement(
    context: BrowsingContext.BrowsingContext,
    uid: string
  ): Promise<ResolvedElement> {
    const element = await this.resolveUidToElement(context, uid);
    const path = await this.bidi.callFunction<number[]>(
      context,
      FRAME_PATH_SCRIPT,
      [nativeToLocalValue(uid)],
      SNAPSHOT_MANAGER_SANDBOX
    );
    if (path.length === 0) {
      return { context, element };
    }

    const { contexts } = await this.bidi.sendCommand('browsingContext.getTree', { root: context });
    let info: BrowsingContext.Info | undefined = contexts[0];
    for (const index of path) {
      info = info?.children?.[index];
    }
    if (!info) {
      throw new Error(notFoundMessage(uid));
    }
    return { context: info.context, element };
  }
}

function notFoundMessage(uid: string): string {
  return (
    `UID not found: ${uid}. The element is gone from the page, or the page was reloaded. ` +
    'Take a fresh snapshot first.'
  );
}
