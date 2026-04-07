/**
 * Snapshot types and interfaces
 */

import type { WebElement } from 'selenium-webdriver';

/**
 * UID entry with CSS and XPath selectors
 */
export interface UidEntry {
  uid: string;
  css: string;
  xpath?: string;
}

/**
 * ARIA attributes
 */
export interface AriaAttributes {
  disabled?: boolean;
  hidden?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  expanded?: boolean;
  autocomplete?: string;
  haspopup?: boolean | string;
  invalid?: boolean | string;
  label?: string;
  labelledby?: string;
  describedby?: string;
  controls?: string;
  level?: number;
}

/**
 * Computed accessibility properties
 */
export interface ComputedProperties {
  focusable?: boolean;
  interactive?: boolean;
  visible?: boolean;
  accessible?: boolean;
}

/**
 * Snapshot node structure
 */
export interface SnapshotNode {
  uid: string;
  tag: string;
  role?: string;
  name?: string;
  value?: string;
  href?: string;
  src?: string;
  text?: string;
  isIframe?: boolean;
  frameSrc?: string;
  crossOrigin?: boolean;
  aria?: AriaAttributes;
  computed?: ComputedProperties;
  children: SnapshotNode[];
}

/**
 * Snapshot JSON structure
 */
export interface SnapshotJson {
  root: SnapshotNode;
  snapshotId: number;
  timestamp: number;
  truncated?: boolean;
  uidMap: UidEntry[];
}

/**
 * Snapshot result
 */
export interface Snapshot {
  text: string;
  json: SnapshotJson;
}

/**
 * Result from injected script
 */
export interface InjectedScriptResult {
  tree: SnapshotNode | null;
  uidMap: UidEntry[];
  error?: string;
  truncated?: boolean;
  selectorError?: string;
  debugLog?: Array<{ el: string; relevant: boolean; depth: number }>;
}

/**
 * Element cache entry
 */
export interface ElementCacheEntry {
  selector: string;
  xpath?: string;
  cachedElement?: WebElement;
  snapshotId: number;
  timestamp: number;
}
