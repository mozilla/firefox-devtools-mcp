/**
 * Firefox Client - Public facade for modular Firefox automation
 */

import type { FirefoxLaunchOptions, ConsoleMessage } from './types.js';
import { FirefoxCore, type IElement } from './core.js';
import { ConsoleEvents, NetworkEvents } from './events/index.js';
import { DomInteractions } from './dom.js';
import { PageManagement } from './pages.js';
import { SnapshotManager, type Snapshot, type SnapshotOptions } from './snapshot/index.js';

/**
 * Main Firefox Client facade
 * Delegates to modular components for clean separation of concerns
 */
export class FirefoxClient {
  private core: FirefoxCore;
  private consoleEvents: ConsoleEvents | null = null;
  private networkEvents: NetworkEvents | null = null;
  private dom: DomInteractions | null = null;
  private pages: PageManagement | null = null;
  private snapshot: SnapshotManager | null = null;

  constructor(options: FirefoxLaunchOptions) {
    this.core = new FirefoxCore(options);
  }

  /**
   * Connect and initialize all modules
   */
  async connect(): Promise<void> {
    await this.core.connect();

    const driver = this.core.getDriver();

    // Initialize snapshot manager first
    this.snapshot = new SnapshotManager(driver);

    // Create centralized navigation handler for lifecycle hooks
    const onNavigate = () => {
      // Clear snapshot on any navigation
      if (this.snapshot) {
        this.snapshot.clear();
      }
    };

    // Initialize event modules with lifecycle hooks
    // BiDi-dependent modules (console/network events) require a full WebDriver with
    // BiDi support. When using --connect-existing, we bypass selenium's BiDi layer
    // so these modules are not available.
    const hasBidi = 'getBidi' in driver && typeof driver.getBidi === 'function';

    if (hasBidi) {
      // Cast to any for BiDi-specific APIs that only exist on selenium WebDriver
      this.consoleEvents = new ConsoleEvents(driver as any, {
        onNavigate,
        autoClearOnNavigate: false,
      });

      this.networkEvents = new NetworkEvents(driver as any, {
        onNavigate,
        autoClearOnNavigate: false,
      });
    }

    // Initialize DOM with UID resolver callback
    this.dom = new DomInteractions(driver, (uid: string) =>
      this.snapshot!.resolveUidToElement(uid)
    );

    this.pages = new PageManagement(
      driver,
      () => this.core.getCurrentContextId(),
      (id: string) => this.core.setCurrentContextId(id)
    );

    // Subscribe to console and network events for ALL contexts (not just current)
    if (this.consoleEvents) {
      await this.consoleEvents.subscribe(undefined);
    }
    if (this.networkEvents) {
      await this.networkEvents.subscribe(undefined);
    }
  }

  // ============================================================================
  // DOM / Evaluate
  // ============================================================================

  async evaluate(script: string): Promise<unknown> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.evaluate(script);
  }

  async getContent(): Promise<string> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.getContent();
  }

  async clickBySelector(selector: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.clickBySelector(selector);
  }

  async hoverBySelector(selector: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.hoverBySelector(selector);
  }

  async fillBySelector(selector: string, text: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.fillBySelector(selector, text);
  }

  async dragAndDropBySelectors(sourceSelector: string, targetSelector: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.dragAndDropBySelectors(sourceSelector, targetSelector);
  }

  async uploadFileBySelector(selector: string, filePath: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.uploadFileBySelector(selector, filePath);
  }

  // UID-based input methods

  async clickByUid(uid: string, dblClick = false): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.clickByUid(uid, dblClick);
  }

  async hoverByUid(uid: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.hoverByUid(uid);
  }

  async fillByUid(uid: string, value: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.fillByUid(uid, value);
  }

  async dragByUidToUid(fromUid: string, toUid: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.dragByUidToUid(fromUid, toUid);
  }

  async fillFormByUid(elements: Array<{ uid: string; value: string }>): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.fillFormByUid(elements);
  }

  async uploadFileByUid(uid: string, filePath: string): Promise<void> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.uploadFileByUid(uid, filePath);
  }

  // ============================================================================
  // Console
  // ============================================================================

  async getConsoleMessages(): Promise<ConsoleMessage[]> {
    if (!this.consoleEvents) {
      throw new Error('Console events not available in connect-existing mode (requires BiDi)');
    }
    return this.consoleEvents.getMessages();
  }

  clearConsoleMessages(): void {
    if (!this.consoleEvents) {
      throw new Error('Console events not available in connect-existing mode (requires BiDi)');
    }
    this.consoleEvents.clearMessages();
  }

  // ============================================================================
  // Pages / Navigation
  // ============================================================================

  async navigate(url: string): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    await this.pages.navigate(url);
    // Clear snapshot on navigation (but NOT console - users can manually clear if needed)
    this.clearSnapshot();
  }

  async navigateBack(): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.navigateBack();
  }

  async navigateForward(): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.navigateForward();
  }

  async setViewportSize(width: number, height: number): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.setViewportSize(width, height);
  }

  async acceptDialog(promptText?: string): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.acceptDialog(promptText);
  }

  async dismissDialog(): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.dismissDialog();
  }

  getTabs(): Array<{ actor: string; title: string; url: string }> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return this.pages.getTabs();
  }

  getSelectedTabIdx(): number {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return this.pages.getSelectedTabIdx();
  }

  async refreshTabs(): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.refreshTabs();
  }

  async selectTab(index: number): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.selectTab(index);
  }

  async createNewPage(url: string): Promise<number> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.createNewPage(url);
  }

  async closeTab(index: number): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.closeTab(index);
  }

  // ============================================================================
  // Network
  // ============================================================================

  async startNetworkMonitoring(): Promise<void> {
    if (!this.networkEvents) {
      throw new Error('Network events not available in connect-existing mode (requires BiDi)');
    }
    this.networkEvents.startMonitoring();
  }

  async stopNetworkMonitoring(): Promise<void> {
    if (!this.networkEvents) {
      throw new Error('Network events not available in connect-existing mode (requires BiDi)');
    }
    this.networkEvents.stopMonitoring();
  }

  async getNetworkRequests(): Promise<any[]> {
    if (!this.networkEvents) {
      throw new Error('Network events not available in connect-existing mode (requires BiDi)');
    }
    return this.networkEvents.getRequests();
  }

  clearNetworkRequests(): void {
    if (!this.networkEvents) {
      throw new Error('Network events not available in connect-existing mode (requires BiDi)');
    }
    this.networkEvents.clearRequests();
  }

  // ============================================================================
  // Snapshot
  // ============================================================================

  async takeSnapshot(options?: SnapshotOptions): Promise<Snapshot> {
    if (!this.snapshot) {
      throw new Error('Not connected');
    }
    return await this.snapshot.takeSnapshot(options);
  }

  resolveUidToSelector(uid: string): string {
    if (!this.snapshot) {
      throw new Error('Not connected');
    }
    return this.snapshot.resolveUidToSelector(uid);
  }

  async resolveUidToElement(uid: string): Promise<IElement> {
    if (!this.snapshot) {
      throw new Error('Not connected');
    }
    return await this.snapshot.resolveUidToElement(uid);
  }

  clearSnapshot(): void {
    if (!this.snapshot) {
      throw new Error('Not connected');
    }
    this.snapshot.clear();
  }

  // ============================================================================
  // Screenshot
  // ============================================================================

  async takeScreenshotPage(): Promise<string> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.takeScreenshotPage();
  }

  async takeScreenshotByUid(uid: string): Promise<string> {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return await this.dom.takeScreenshotByUid(uid);
  }

  // ============================================================================
  // Internal / Advanced
  // ============================================================================

  /**
   * Send raw BiDi command (for advanced operations)
   * @internal
   */
  async sendBiDiCommand(method: string, params: Record<string, any> = {}): Promise<any> {
    return await this.core.sendBiDiCommand(method, params);
  }

  /**
   * Get WebDriver instance (for advanced operations)
   * @internal
   */
  getDriver(): any {
    return this.core.getDriver();
  }

  /**
   * Get current browsing context ID (for advanced operations)
   * @internal
   */
  getCurrentContextId(): string | null {
    return this.core.getCurrentContextId();
  }

  /**
   * Check if Firefox is still connected and responsive
   * Returns false if Firefox was closed or connection is broken
   */
  async isConnected(): Promise<boolean> {
    return await this.core.isConnected();
  }

  /**
   * Get log file path (if logging is enabled)
   */
  getLogFilePath(): string | undefined {
    return this.core.getLogFilePath();
  }

  /**
   * Get current launch options
   */
  getOptions(): FirefoxLaunchOptions {
    return this.core.getOptions();
  }

  /**
   * Reset all internal state (used when Firefox is detected as closed)
   */
  reset(): void {
    this.core.reset();
    this.consoleEvents = null;
    this.networkEvents = null;
    this.dom = null;
    this.pages = null;
    this.snapshot = null;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async close(): Promise<void> {
    await this.core.close();
  }
}

// Re-export types
export type { Snapshot } from './snapshot/index.js';

// Re-export for backward compatibility
export { FirefoxClient as FirefoxDevTools };
