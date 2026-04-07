/**
 * Snapshot Manager
 * Handles snapshot creation using bundled injected script
 */

import { WebDriver, WebElement } from 'selenium-webdriver';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logDebug } from '../../utils/logger.js';
import type { Snapshot, SnapshotJson, InjectedScriptResult } from './types.js';
import { formatSnapshotTree } from './formatter.js';
import { UidResolver } from './resolver.js';

/**
 * Options for snapshot creation
 */
export interface SnapshotOptions {
  includeAll?: boolean;
  selector?: string;
}

/**
 * Snapshot Manager
 * Uses bundled injected script for snapshot creation
 */
export class SnapshotManager {
  private driver: WebDriver;
  private resolver: UidResolver;
  private injectedScript: string | null = null;
  private currentSnapshotId = 0;

  constructor(driver: WebDriver) {
    this.driver = driver;
    this.resolver = new UidResolver(driver);
  }

  /**
   * Lazy load bundled injected script
   */
  private getInjectedScript(): string {
    if (this.injectedScript) {
      return this.injectedScript;
    }

    try {
      // Get the directory where this compiled file lives (dist/)
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const currentDir = dirname(currentFilePath);

      // Try multiple potential locations
      const possiblePaths = [
        // Production: relative to bundled dist/index.js (same directory)
        resolve(currentDir, 'snapshot.injected.global.js'),
        // Development: relative to current working directory
        resolve(process.cwd(), 'dist/snapshot.injected.global.js'),
        // npx: package is in node_modules, try to find it relative to the binary
        resolve(currentDir, '../snapshot.injected.global.js'),
      ];

      const attemptedPaths: string[] = [];

      for (const path of possiblePaths) {
        attemptedPaths.push(path);
        try {
          this.injectedScript = readFileSync(path, 'utf-8');
          const sizeKB = (this.injectedScript.length / 1024).toFixed(1);
          logDebug(`✓ Loaded snapshot bundle: ${path.split('/').pop()} (${sizeKB} KB)`);
          return this.injectedScript;
        } catch {
          // Try next path
        }
      }

      throw new Error(
        `Bundle not found in any expected location. Tried paths:\n${attemptedPaths.map((p) => `  - ${p}`).join('\n')}`
      );
    } catch (error: any) {
      throw new Error(
        `Failed to load bundled snapshot script: ${error.message}. ` +
          'Make sure you have run "npm run build" to generate the bundle.'
      );
    }
  }

  /**
   * Take a snapshot of the current page
   * Returns text and JSON with snapshotId, no DOM mutations
   */
  async takeSnapshot(options?: SnapshotOptions): Promise<Snapshot> {
    const snapshotId = ++this.currentSnapshotId;
    this.resolver.setSnapshotId(snapshotId);
    this.resolver.clear();

    logDebug(`Taking snapshot (ID: ${snapshotId})...`);

    // Execute bundled injected script
    const result = await this.executeInjectedScript(snapshotId, options);

    logDebug(
      `Snapshot executeScript result: hasResult=${!!result}, hasTree=${!!result?.tree}, truncated=${result?.truncated || false}`
    );

    // Debug: log isRelevant results
    if (result?.debugLog && Array.isArray(result.debugLog)) {
      logDebug(`isRelevant debug log (${result.debugLog.length} elements checked):`);
      result.debugLog.slice(0, 20).forEach((log: any) => {
        logDebug(`  ${log.relevant ? '✓' : '✗'} ${log.el} (depth ${log.depth})`);
      });
      if (result.debugLog.length > 20) {
        logDebug(`  ... and ${result.debugLog.length - 20} more`);
      }
    }

    // Handle selector error
    if (result?.selectorError) {
      logDebug(`Snapshot generation failed: ${result.selectorError}`);
      throw new Error(result.selectorError);
    }

    if (!result?.tree) {
      const errorMsg = 'Unknown error';
      logDebug(`Snapshot generation failed: ${errorMsg}`);
      throw new Error(`Failed to generate snapshot: ${errorMsg}`);
    }

    // Store UID mappings in resolver
    this.resolver.storeUidMappings(result.uidMap);

    // Create snapshot object
    const snapshotJson: SnapshotJson = {
      root: result.tree,
      snapshotId,
      timestamp: Date.now(),
      truncated: result.truncated || false,
      uidMap: result.uidMap,
    };

    const snapshot: Snapshot = {
      text: formatSnapshotTree(result.tree),
      json: snapshotJson,
    };

    logDebug(
      `Snapshot created: ${result.uidMap.length} elements with UIDs${result.truncated ? ' (truncated)' : ''}`
    );

    return snapshot;
  }

  /**
   * Resolve UID to CSS selector (with staleness check)
   */
  resolveUidToSelector(uid: string): string {
    return this.resolver.resolveUidToSelector(uid);
  }

  /**
   * Resolve UID to WebElement (with staleness check and caching)
   */
  async resolveUidToElement(uid: string): Promise<WebElement> {
    return await this.resolver.resolveUidToElement(uid);
  }

  /**
   * Clear snapshot (called on navigation)
   */
  clear(): void {
    this.resolver.clear();
  }

  /**
   * Execute bundled injected snapshot script
   */
  private async executeInjectedScript(
    snapshotId: number,
    options?: SnapshotOptions
  ): Promise<InjectedScriptResult> {
    const scriptSource = this.getInjectedScript();

    // Inject and execute the bundled script
    // The script exposes window.__createSnapshot via IIFE global
    // Guard: Only inject once, then reuse
    const result = await this.driver.executeScript<InjectedScriptResult>(
      `
      // Only inject the bundle if not already present
      if (typeof window.__createSnapshot === 'undefined') {
        ${scriptSource}
        // Register the createSnapshot function globally
        if (typeof __SnapshotInjected !== 'undefined' && __SnapshotInjected.createSnapshot) {
          window.__createSnapshot = __SnapshotInjected.createSnapshot;
        }
      }
      // Call it with options
      return window.__createSnapshot(arguments[0], arguments[1]);
      `,
      snapshotId,
      options || {}
    );

    return result;
  }
}
