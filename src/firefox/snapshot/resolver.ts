/**
 * UID Resolver
 * Handles UID validation, resolution to selectors/elements, and element caching
 */

import { By, WebDriver, WebElement } from 'selenium-webdriver';
import { logDebug } from '../../utils/logger.js';
import type { UidEntry } from './types.js';

interface WebElementCacheEntry {
  selector: string;
  xpath?: string;
  cachedElement: WebElement;
  snapshotId: number;
  timestamp: number;
}

/**
 * UID Resolver class
 * Separated from SnapshotManager for better modularity
 */
export class UidResolver {
  private uidToEntry = new Map<string, UidEntry>();
  private elementCache = new Map<string, WebElementCacheEntry>();
  private currentSnapshotId = 0;

  constructor(private driver: WebDriver) {}

  /**
   * Update current snapshot ID
   */
  setSnapshotId(snapshotId: number): void {
    this.currentSnapshotId = snapshotId;
  }

  /**
   * Get current snapshot ID
   */
  getSnapshotId(): number {
    return this.currentSnapshotId;
  }

  /**
   * Store UID mappings from snapshot result
   */
  storeUidMappings(uidMap: UidEntry[]): void {
    this.uidToEntry.clear();
    for (const entry of uidMap) {
      this.uidToEntry.set(entry.uid, entry);
    }
  }

  /**
   * Clear all UID mappings and cache
   */
  clear(): void {
    this.uidToEntry.clear();
    this.elementCache.clear();
    logDebug('Snapshot UIDs cleared');
  }

  /**
   * Validate UID (staleness check)
   */
  validateUid(uid: string): void {
    const parts = uid.split('_');
    if (parts.length < 2 || !parts[0]) {
      throw new Error(`Invalid UID format: ${uid}`);
    }

    const uidSnapshotId = parseInt(parts[0], 10);
    if (isNaN(uidSnapshotId)) {
      throw new Error(`Invalid UID format: ${uid}`);
    }

    if (uidSnapshotId !== this.currentSnapshotId) {
      throw new Error(
        `This uid is from a stale snapshot (snapshot ${uidSnapshotId}, current ${this.currentSnapshotId}). Take a fresh snapshot.`
      );
    }
  }

  /**
   * Resolve UID to CSS selector (with staleness check)
   */
  resolveUidToSelector(uid: string): string {
    this.validateUid(uid);

    const entry = this.uidToEntry.get(uid);
    if (!entry) {
      throw new Error(`UID not found: ${uid}. Take a fresh snapshot first.`);
    }

    return entry.css;
  }

  /**
   * Resolve UID to element (with staleness check and caching)
   * Tries CSS first, falls back to XPath
   */
  async resolveUidToElement(uid: string): Promise<WebElement> {
    this.validateUid(uid);

    const entry = this.uidToEntry.get(uid);
    if (!entry) {
      throw new Error(`UID not found: ${uid}. Take a fresh snapshot first.`);
    }

    // Check cache
    const cached = this.elementCache.get(uid);
    if (cached?.cachedElement) {
      try {
        // Validate element is still alive
        await cached.cachedElement.isDisplayed();
        logDebug(`Using cached element for UID: ${uid}`);
        return cached.cachedElement;
      } catch {
        // Element is stale, re-find it
        logDebug(`Cached element stale for UID: ${uid}, re-finding...`);
      }
    }

    // Try CSS selector first
    try {
      const element = await this.driver.findElement(By.css(entry.css));

      // Update cache
      this.elementCache.set(uid, {
        selector: entry.css,
        ...(entry.xpath && { xpath: entry.xpath }),
        cachedElement: element,
        snapshotId: this.currentSnapshotId,
        timestamp: Date.now(),
      });

      logDebug(`Found element by CSS for UID: ${uid}`);
      return element;
    } catch {
      logDebug(`CSS selector failed for UID: ${uid}, trying XPath fallback...`);

      // Fallback to XPath if available
      const xpathSelector = entry.xpath;
      if (xpathSelector) {
        try {
          const element = await this.driver.findElement(By.xpath(xpathSelector));

          // Update cache
          this.elementCache.set(uid, {
            selector: entry.css,
            ...(xpathSelector && { xpath: xpathSelector }),
            cachedElement: element,
            snapshotId: this.currentSnapshotId,
            timestamp: Date.now(),
          });

          logDebug(`Found element by XPath for UID: ${uid}`);
          return element;
        } catch {
          throw new Error(
            `Element not found for UID: ${uid}. The element may have changed. Take a fresh snapshot.`
          );
        }
      }

      throw new Error(
        `Element not found for UID: ${uid}. The element may have changed. Take a fresh snapshot.`
      );
    }
  }
}
