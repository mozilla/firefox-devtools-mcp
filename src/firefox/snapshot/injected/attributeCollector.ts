/**
 * Attribute collection utilities (runs in browser context)
 */

import type { AriaAttributes, ComputedProperties } from '../types.js';
import { isFocusable, isInteractive } from './elementCollector.js';

/**
 * Max text length
 */
const MAX_TEXT_LENGTH = 100;

/**
 * Get element name/label
 * Checks aria-label, associated label, placeholder, title, alt
 */
export function getElementName(el: Element): string | undefined {
  // aria-label
  if (el.hasAttribute('aria-label')) {
    return el.getAttribute('aria-label') || undefined;
  }

  const label = (el as HTMLInputElement).labels?.[0];
  if (label) {
    const name = getLabelText(label);
    if (name) {
      return name;
    }
  }

  // placeholder
  if (el.hasAttribute('placeholder')) {
    return el.getAttribute('placeholder') || undefined;
  }

  // title
  if (el.hasAttribute('title')) {
    return el.getAttribute('title') || undefined;
  }

  // alt for images
  if (el.hasAttribute('alt')) {
    return el.getAttribute('alt') || undefined;
  }

  // text content for buttons/links/headings
  const tag = el.tagName.toLowerCase();
  if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(tag) !== -1) {
    return getTextContent(el);
  }

  return undefined;
}

/**
 * Text of a label without the controls it wraps, so that a select does not name itself after its
 * options
 */
function getLabelText(label: HTMLLabelElement): string | undefined {
  const copy = label.cloneNode(true) as HTMLLabelElement;
  for (const control of copy.querySelectorAll('input, select, textarea, button')) {
    control.remove();
  }
  return copy.textContent?.replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * Get direct text content (not from deep children)
 */
export function getTextContent(el: Element): string | undefined {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node?.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.substring(0, MAX_TEXT_LENGTH);
}

/**
 * Get ARIA attributes
 */
export function getAriaAttributes(el: Element): AriaAttributes | undefined {
  const aria: AriaAttributes = {};
  let hasAny = false;

  // Boolean states
  const booleanAttrs: Array<'disabled' | 'hidden' | 'selected' | 'expanded'> = [
    'disabled',
    'hidden',
    'selected',
    'expanded',
  ];
  for (const attr of booleanAttrs) {
    const value = el.getAttribute(`aria-${attr}`);
    if (value !== null) {
      aria[attr] = value === 'true';
      hasAny = true;
    }
  }

  // Mixed states (true/false/mixed)
  const mixedAttrs: Array<'checked' | 'pressed'> = ['checked', 'pressed'];
  for (const attr of mixedAttrs) {
    const value = el.getAttribute(`aria-${attr}`);
    if (value !== null) {
      if (value === 'mixed') {
        aria[attr] = 'mixed';
      } else {
        aria[attr] = value === 'true';
      }
      hasAny = true;
    }
  }

  // String properties
  const stringAttrs: Array<
    'autocomplete' | 'haspopup' | 'invalid' | 'label' | 'labelledby' | 'describedby' | 'controls'
  > = ['autocomplete', 'haspopup', 'invalid', 'label', 'labelledby', 'describedby', 'controls'];
  for (const attr of stringAttrs) {
    const value = el.getAttribute(`aria-${attr}`);
    if (value) {
      if (attr === 'haspopup' || attr === 'invalid') {
        aria[attr] = value as boolean | string;
      } else {
        aria[attr] = value;
      }
      hasAny = true;
    }
  }

  // Numeric properties
  const levelValue = el.getAttribute('aria-level');
  if (levelValue) {
    const level = parseInt(levelValue, 10);
    if (!isNaN(level)) {
      aria.level = level;
      hasAny = true;
    }
  }

  return hasAny ? aria : undefined;
}

/**
 * Get computed accessibility properties
 */
export function getComputedProperties(el: Element): ComputedProperties {
  const computed: ComputedProperties = {};

  // Visible
  try {
    const style = window.getComputedStyle(el);
    // Parse opacity as number to handle '0', '0.0', '0.00', etc.
    const opacity = parseFloat(style.opacity);
    computed.visible =
      style.display !== 'none' && style.visibility !== 'hidden' && opacity !== 0 && !isNaN(opacity);
  } catch {
    computed.visible = false;
  }

  // Accessible (not aria-hidden and visible)
  computed.accessible = computed.visible && !el.getAttribute('aria-hidden');

  // Focusable
  computed.focusable = isFocusable(el);

  // Interactive
  computed.interactive = isInteractive(el);

  return computed;
}
