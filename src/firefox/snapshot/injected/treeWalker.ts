/**
 * Tree walker with iframe support (runs in browser context)
 */

import type { SnapshotNode } from '../types.js';
import { isRelevant, isVisible } from './elementCollector.js';
import {
  getElementName,
  getTextContent,
  getAriaAttributes,
  getComputedProperties,
} from './attributeCollector.js';
import { getUid } from './uidRegistry.js';

/**
 * Configuration
 */
const MAX_DEPTH = 10;
const MAX_NODES = 1000;

/**
 * Tree walker options
 */
export interface TreeWalkerOptions {
  includeAll?: boolean;
  includeIframes?: boolean;
}

/**
 * Tree walker result
 */
export interface TreeWalkerResult {
  tree: SnapshotNode | null;
  /** Number of elements included in the tree (each one has a UID) */
  nodeCount: number;
  truncated: boolean;
  /** Element id counter after this walk, to be passed to the next one */
  nextElementId: number;
  /**
   * UIDs newly assigned by this walk. The caller adds them to the UID registry once the snapshot
   * has been created successfully, so a walk that fails leaves no UIDs behind.
   */
  newUids: Map<string, Element>;
}

/**
 * Internal walk result with bubble-up support
 */
interface WalkResult {
  node: SnapshotNode | null;
  relevantChildren: SnapshotNode[];
}

/**
 * Walk DOM tree and collect snapshot
 */
export function walkTree(
  rootElement: Element,
  nextElementId: number,
  options: TreeWalkerOptions = {}
): TreeWalkerResult {
  const { includeAll = false, includeIframes = true } = options;

  let nodeCount = 0;
  let elementId = nextElementId;
  let truncated = false;
  const newUids = new Map<string, Element>();

  function walk(el: Element, depth: number): WalkResult {
    // Check limits
    if (depth > MAX_DEPTH) {
      truncated = true;
      return { node: null, relevantChildren: [] };
    }

    if (nodeCount >= MAX_NODES) {
      truncated = true;
      return { node: null, relevantChildren: [] };
    }

    // Check relevance (except root)
    const isRoot = depth === 0;

    // Determine if element is relevant based on mode
    let elementIsRelevant: boolean;
    if (includeAll) {
      // Include all mode: only check visibility
      elementIsRelevant = isRoot || isVisible(el);
    } else {
      // Standard mode: use full relevance filter
      elementIsRelevant = isRoot || isRelevant(el);
    }

    // Always walk children first (bubble-up pattern)
    const childResults: SnapshotNode[] = [];

    // Handle iframes
    const tag = el.tagName.toLowerCase();
    if (tag === 'iframe' && includeIframes && elementIsRelevant) {
      try {
        const iframe = el as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

        if (iframeDoc?.body) {
          // Same-origin iframe - traverse it
          const iframeResult = walk(iframeDoc.body, depth + 1);
          if (iframeResult.node) {
            iframeResult.node.isIframe = true;
            iframeResult.node.frameSrc = iframe.src;
            childResults.push(iframeResult.node);
          }
        }
      } catch {
        // Cross-origin error - will be handled when creating node
      }
    } else {
      // Walk regular children
      const children = el.shadowRoot ? [...el.shadowRoot.children, ...el.children] : el.children;
      for (let i = 0; i < children.length; i++) {
        if (nodeCount >= MAX_NODES) {
          truncated = true;
          break;
        }

        const child = children[i];
        if (!child) {
          continue;
        }

        const childResult = walk(child, depth + 1);

        if (childResult.node) {
          // Child is relevant, include it
          childResults.push(childResult.node);
        } else if (childResult.relevantChildren.length > 0) {
          // Child is not relevant but has relevant descendants - bubble them up
          childResults.push(...childResult.relevantChildren);
        }
      }
    }

    // Now decide if THIS element should be included
    if (!elementIsRelevant) {
      // Element is not relevant, but pass up its relevant children
      return { node: null, relevantChildren: childResults };
    }

    // Element IS relevant - create node.
    // Reuse the UID from a previous walk so UIDs stay stable across snapshots.
    let uid = getUid(el);
    if (uid === undefined) {
      uid = `e${elementId++}`;
      newUids.set(uid, el);
    }
    nodeCount++;

    // Collect attributes
    const htmlEl = el as HTMLElement;
    const idAttr = el.id;
    const roleAttr = el.getAttribute('role');
    const nameAttr = getElementName(el);
    const textAttr = getTextContent(el);
    const valueAttr = (htmlEl as any).value;
    const hrefAttr = (htmlEl as any).href;
    const srcAttr = (htmlEl as any).src;
    const ariaAttr = getAriaAttributes(el);
    const computedAttr = getComputedProperties(el);

    const node: SnapshotNode = {
      uid,
      tag,
      ...(idAttr && { id: idAttr }),
      ...(roleAttr && { role: roleAttr }),
      ...(nameAttr && { name: nameAttr }),
      ...(valueAttr && { value: valueAttr }),
      ...(hrefAttr && { href: hrefAttr }),
      ...(srcAttr && { src: srcAttr }),
      ...(textAttr && { text: textAttr }),
      ...(ariaAttr && { aria: ariaAttr }),
      ...(computedAttr && { computed: computedAttr }),
      children: childResults,
    };

    // Special handling for cross-origin iframes
    if (tag === 'iframe' && includeIframes) {
      try {
        const iframe = el as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

        if (!iframeDoc?.body) {
          // Cross-origin or no body - placeholder
          node.isIframe = true;
          node.frameSrc = iframe.src;
          node.crossOrigin = true;
        }
      } catch {
        // Cross-origin error - add placeholder
        node.isIframe = true;
        node.frameSrc = (el as HTMLIFrameElement).src;
        node.crossOrigin = true;
      }
    }

    return { node, relevantChildren: [] };
  }

  const result = walk(rootElement, 0);

  return {
    tree: result.node,
    nodeCount,
    truncated,
    nextElementId: elementId,
    newUids,
  };
}
