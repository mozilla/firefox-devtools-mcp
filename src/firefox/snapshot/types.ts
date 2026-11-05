/**
 * Snapshot types and interfaces
 */

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
  id?: string;
  role?: string;
  name?: string;
  /** Input type, left out for text inputs */
  type?: string;
  /** Checked state of a checkbox or radio button */
  checked?: boolean;
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
  timestamp: number;
  truncated?: boolean;
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
  nodeCount: number;
  nextElementId: number;
  error?: string;
  truncated?: boolean;
  selectorError?: string;
  debugLog?: Array<{ el: string; relevant: boolean; depth: number }>;
}
