/**
 * Snapshot injected script entry point
 * This gets bundled and injected into browser context
 */

import { walkTree, type TreeWalkerOptions } from './treeWalker.js';
import type { TreeWalkerResult } from './treeWalker.js';

/**
 * Options for snapshot creation
 */
export interface CreateSnapshotOptions extends TreeWalkerOptions {
  selector?: string;
}

/**
 * Result from snapshot creation
 */
export interface CreateSnapshotResult extends TreeWalkerResult {
  selectorError?: string;
}

/**
 * Create snapshot of current page
 * This function is called from executeScript
 */
export function createSnapshot(
  snapshotId: number,
  options?: CreateSnapshotOptions
): CreateSnapshotResult {
  try {
    // Determine root element
    let rootElement: Element = document.body;

    if (options?.selector) {
      try {
        const selected = document.querySelector(options.selector);
        if (!selected) {
          return {
            tree: null,
            uidMap: [],
            truncated: false,
            selectorError: `Selector "${options.selector}" not found`,
          };
        }
        rootElement = selected;
      } catch {
        return {
          tree: null,
          uidMap: [],
          truncated: false,
          selectorError: `Invalid selector syntax: "${options.selector}"`,
        };
      }
    }

    // Walk from root element
    const treeOptions: TreeWalkerOptions = {
      includeIframes: options?.includeIframes ?? true,
    };
    if (options?.includeAll !== undefined) {
      treeOptions.includeAll = options.includeAll;
    }
    const result = walkTree(rootElement, snapshotId, treeOptions);

    if (!result.tree) {
      throw new Error('Failed to generate tree');
    }

    return result;
  } catch {
    return {
      tree: null,
      uidMap: [],
      truncated: false,
    };
  }
}

// Make it available globally for executeScript
if (typeof window !== 'undefined') {
  (window as any).__createSnapshot = createSnapshot;
}
