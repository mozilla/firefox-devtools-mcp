/**
 * Snapshot text formatter
 * Formats snapshot tree as LLM-friendly text
 */

import type { SnapshotNode } from './types.js';

/**
 * Max attribute value length (aggressive truncation for token efficiency)
 */
const MAX_ATTR_LENGTH = 30;

/**
 * Formatting options
 */
export interface FormatOptions {
  includeAttributes?: boolean;
  includeText?: boolean;
  maxDepth?: number;
  /** Max attribute value length; pass Infinity to keep values untruncated (default: 30) */
  maxAttrLength?: number;
}

/**
 * Format snapshot tree as human-readable text
 */
export function formatSnapshotTree(
  node: SnapshotNode,
  depth = 0,
  options: FormatOptions = {}
): string {
  const {
    includeAttributes = true,
    includeText = true,
    maxDepth,
    maxAttrLength = MAX_ATTR_LENGTH,
  } = options;

  // Check max depth
  if (maxDepth !== undefined && depth >= maxDepth) {
    return '';
  }
  const indent = '  '.repeat(depth);
  const attrs: string[] = [];

  // UID (always first)
  attrs.push(`uid=${node.uid}`);

  // Role or tag
  const role = node.role || node.tag;
  attrs.push(role);

  // Name (in quotes) - only if exists
  if (node.name) {
    attrs.push(`"${truncate(node.name, maxAttrLength)}"`);
  }

  // Tag (for debugging)
  if (node.role && node.role !== node.tag) {
    attrs.push(`tag=${node.tag}`);
  }

  if (node.type) {
    attrs.push(`type=${node.type}`);
  }

  if (node.checked !== undefined) {
    attrs.push(node.checked ? 'checked' : 'unchecked');
  }

  // Value
  if (node.value) {
    attrs.push(`value="${truncate(node.value, maxAttrLength)}"`);
  }

  // Href
  if (node.href) {
    attrs.push(`href="${truncate(node.href, maxAttrLength)}"`);
  }

  // Src
  if (node.src) {
    attrs.push(`src="${truncate(node.src, maxAttrLength)}"`);
  }

  // Text (controlled by includeText option)
  if (includeText && node.text) {
    attrs.push(`text="${truncate(node.text, maxAttrLength)}"`);
  }

  // ARIA attributes (controlled by includeAttributes option)
  if (includeAttributes && node.aria) {
    // Boolean states
    if (node.aria.disabled) {
      attrs.push('disabled');
    }
    if (node.aria.hidden) {
      attrs.push('hidden');
    }
    if (node.aria.selected) {
      attrs.push('selected');
    }
    if (node.aria.expanded !== undefined) {
      attrs.push(node.aria.expanded ? 'expanded' : 'collapsed');
    }

    // Mixed states
    if (node.aria.checked !== undefined) {
      if (node.aria.checked === 'mixed') {
        attrs.push('checked="mixed"');
      } else {
        attrs.push(node.aria.checked ? 'checked' : 'unchecked');
      }
    }

    if (node.aria.pressed !== undefined) {
      if (node.aria.pressed === 'mixed') {
        attrs.push('pressed="mixed"');
      } else {
        attrs.push(node.aria.pressed ? 'pressed' : 'unpressed');
      }
    }

    // String properties
    if (node.aria.autocomplete) {
      attrs.push(`autocomplete="${node.aria.autocomplete}"`);
    }
    if (node.aria.haspopup) {
      attrs.push(`haspopup="${node.aria.haspopup}"`);
    }
    if (node.aria.invalid) {
      attrs.push(`invalid="${node.aria.invalid}"`);
    }
    if (node.aria.level) {
      attrs.push(`level=${node.aria.level}`);
    }
  }

  // Computed properties (controlled by includeAttributes option)
  if (includeAttributes && node.computed) {
    if (node.computed.focusable) {
      attrs.push('focusable');
    }
    if (node.computed.interactive) {
      attrs.push('interactive');
    }
    if (!node.computed.visible) {
      attrs.push('invisible');
    }
    if (!node.computed.accessible) {
      attrs.push('inaccessible');
    }
  }

  // Iframe marker
  if (node.isIframe) {
    attrs.push('[iframe');
    if (node.frameSrc) {
      attrs.push(`src="${truncate(node.frameSrc, maxAttrLength)}"`);
    }
    if (node.crossOrigin) {
      attrs.push('cross-origin');
    }
    attrs.push(']');
  }

  let result = indent + attrs.join(' ') + '\n';

  // Format children (pass options recursively)
  for (const child of node.children) {
    result += formatSnapshotTree(child, depth + 1, options);
  }

  return result;
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  return str.substring(0, maxLen - 3) + '...';
}
