/**
 * Selector generation utilities (runs in browser context)
 */

/**
 * Preferred ID attributes in order of priority
 */
const PREFERRED_ID_ATTRS = ['id', 'data-testid', 'data-test-id'];

/**
 * Max segment length for selectors
 */
const MAX_SEGMENT_LENGTH = 64;

/**
 * Generate CSS selector for element
 * Prefers stable identifiers: id, data-testid, then falls back to nth-of-type
 */
export function generateCssSelector(el: Element): string {
  const path: string[] = [];
  let current: Element | null = el;

  while (current?.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();

    // Check for preferred ID attributes
    let hasId = false;
    for (const idAttr of PREFERRED_ID_ATTRS) {
      const value = current.getAttribute(idAttr);
      if (value) {
        if (idAttr === 'id') {
          selector += '#' + CSS.escape(value);
        } else {
          selector += `[${idAttr}="${escapeCssAttributeValue(value)}"]`;
        }
        path.unshift(selector);
        hasId = true;
        break;
      }
    }

    if (hasId) {
      break; // ID is unique, stop here
    }

    // Check for aria-label + role combination (often stable)
    const ariaLabel = current.getAttribute('aria-label');
    const role = current.getAttribute('role');
    if (ariaLabel && role) {
      selector += `[role="${role}"][aria-label="${escapeCssAttributeValue(ariaLabel)}"]`;
      path.unshift(selector);
      // Continue to parent for context
      current = current.parentElement;
      continue;
    }

    // Fall back to nth-of-type
    const siblings = current.parentElement?.children;
    if (siblings && siblings.length > 1) {
      let nth = 1;
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (!sibling) {
          continue;
        }
        if (sibling === current) {
          break;
        }
        if (sibling.nodeName === current.nodeName) {
          nth++;
        }
      }
      if (nth > 1 || (siblings.length > 1 && siblings[0] !== current)) {
        selector += `:nth-of-type(${nth})`;
      }
    }

    path.unshift(truncateSegment(selector));
    current = current.parentElement;

    // Stop at body
    if (current?.nodeName.toLowerCase() === 'body') {
      path.unshift('body');
      break;
    }
  }

  return path.join(' > ');
}

/**
 * Generate XPath for element
 */
export function generateXPath(el: Element): string {
  // Check for ID first
  const id = el.id;
  if (id) {
    return `//*[@id="${escapeXPathValue(id)}"]`;
  }

  const path: string[] = [];
  let current: Element | null = el;

  while (current?.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.nodeName.toLowerCase();

    // Count position among siblings of same tag
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.nodeName.toLowerCase() === tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    // Only add index if there are multiple siblings of same type
    const parent = current.parentElement;
    let needsIndex = false;
    if (parent) {
      const siblingsOfSameType = Array.from(parent.children).filter(
        (child) => child.nodeName.toLowerCase() === tagName
      );
      needsIndex = siblingsOfSameType.length > 1;
    }

    const pathSegment = needsIndex ? `${tagName}[${index}]` : tagName;
    path.unshift(pathSegment);

    current = current.parentElement;

    // Stop at html
    if (current?.nodeName.toLowerCase() === 'html') {
      path.unshift('html');
      break;
    }
  }

  return '/' + path.join('/');
}

/**
 * Escape CSS attribute value
 */
function escapeCssAttributeValue(value: string): string {
  return value.replace(/"/g, '\\' + '"').substring(0, MAX_SEGMENT_LENGTH);
}

/**
 * Escape XPath value
 */
function escapeXPathValue(value: string): string {
  // Simple escape - handle quotes
  if (value.indexOf('"') === -1) {
    return value;
  }
  if (value.indexOf("'") === -1) {
    return value;
  }
  // Contains both quotes - use concat
  const parts = value.split('"').map((part, idx, arr) => {
    if (idx === arr.length - 1) {
      return part ? `"${part}"` : '';
    }
    return part ? `"${part}",'"'` : '"\'"';
  });
  return `concat(${parts.filter((p) => p).join(',')})`;
}

/**
 * Truncate selector segment
 */
function truncateSegment(segment: string): string {
  if (segment.length <= MAX_SEGMENT_LENGTH) {
    return segment;
  }
  return segment.substring(0, MAX_SEGMENT_LENGTH);
}
