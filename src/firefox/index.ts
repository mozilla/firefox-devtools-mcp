/**
 * Firefox Client - Public facade for modular Firefox automation
 */

import type { FirefoxLaunchOptions, ConsoleMessage, LogpointResult } from './types.js';
import type { Browser, BrowsingContext, Network, Script } from 'webdriver-bidi-protocol';
import { FirefoxCore } from './core.js';
import { BiDiFacade } from './bidi.js';
import { logDebug } from '../utils/logger.js';
import { ConsoleEvents, NetworkEvents, DebuggingEvents, DownloadEvents } from './events/index.js';
import type { NetworkBodyResult } from './events/network.js';
import { DomInteractions } from './dom.js';
import { PageManagement } from './pages.js';
import { CacheManagement, type CacheBehavior } from './cache.js';
import { SnapshotManager, type Snapshot, type SnapshotOptions } from './snapshot/index.js';

/**
 * Main Firefox Client facade
 * Delegates to modular components for clean separation of concerns
 */
export class FirefoxClient {
  private core: FirefoxCore;
  private bidi: BiDiFacade | null = null;
  private consoleEvents: ConsoleEvents | null = null;
  private networkEvents: NetworkEvents | null = null;
  private debuggingEvents: DebuggingEvents | null = null;
  private downloadEvents: DownloadEvents | null = null;
  private dom: DomInteractions | null = null;
  private pages: PageManagement | null = null;
  private cache: CacheManagement | null = null;
  private snapshot: SnapshotManager | null = null;

  constructor(options: FirefoxLaunchOptions) {
    this.core = new FirefoxCore(options);
  }

  private getBidi(): BiDiFacade {
    if (!this.bidi) {
      throw new Error('Not connected');
    }
    return this.bidi;
  }

  private getDom(): DomInteractions {
    if (!this.dom) {
      throw new Error('Not connected');
    }
    return this.dom;
  }

  private getSnapshot(): SnapshotManager {
    if (!this.snapshot) {
      throw new Error('Not connected');
    }
    return this.snapshot;
  }

  private getContext(): BrowsingContext.BrowsingContext {
    const context = this.core.getCurrentContextId();
    if (!context) {
      throw new Error('No active browsing context');
    }
    return context;
  }

  /**
   * Connect and initialize all modules
   */
  async connect(): Promise<void> {
    await this.core.connect();

    const driver = this.core.getDriver();

    this.bidi = new BiDiFacade(driver);

    // Initialize snapshot manager first
    this.snapshot = new SnapshotManager(this.bidi);

    this.consoleEvents = new ConsoleEvents(this.bidi, {
      autoClearOnNavigate: false,
    });
    try {
      await this.consoleEvents.subscribe();
    } catch {
      logDebug('Unable to subscribe to console events');
      this.consoleEvents = null;
    }

    this.networkEvents = new NetworkEvents(this.bidi, {
      autoClearOnNavigate: false,
      captureBodies: this.core.getOptions().captureNetworkBodies !== false,
    });
    try {
      await this.networkEvents.subscribe();
    } catch {
      logDebug('Unable to subscribe to network events');
      this.networkEvents = null;
    }

    this.debuggingEvents = new DebuggingEvents(this.bidi);
    try {
      await this.debuggingEvents.subscribe();
    } catch {
      logDebug('Unable to subscribe to debugging events');
      this.debuggingEvents = null;
    }

    this.downloadEvents = new DownloadEvents(this.bidi);
    try {
      await this.downloadEvents.subscribe();
    } catch {
      logDebug('Unable to subscribe to download events');
      this.downloadEvents = null;
    }

    // Initialize DOM with UID resolver callback
    this.dom = new DomInteractions(
      this.bidi,
      (context: BrowsingContext.BrowsingContext, uid: string) =>
        this.snapshot!.resolveUidToElement(context, uid)
    );

    this.pages = new PageManagement(
      driver,
      () => this.core.getCurrentContextId(),
      (id: string) => this.core.setCurrentContextId(id),
      (method, params) => this.getBidi().sendCommand(method, params)
    );

    this.cache = new CacheManagement(
      () => this.core.getCurrentContextId(),
      (method, params) => this.getBidi().sendCommand(method, params)
    );
  }

  // ============================================================================
  // DOM / Evaluate
  // ============================================================================

  /**
   * Evaluate a JavaScript expression in the current browsing context over
   * WebDriver BiDi (script.evaluate), so reads target the BiDi-tracked context
   * rather than Selenium's classic window handle. Returns the result as a
   * native value; throws on a script exception.
   */
  async evaluate(expression: string): Promise<unknown> {
    return await this.getBidi().evaluate(expression, this.getContext());
  }

  // UID-based input methods

  async clickByUid(uid: string, dblClick = false): Promise<void> {
    return await this.getDom().clickByUid(this.getContext(), uid, dblClick);
  }

  async hoverByUid(uid: string): Promise<void> {
    return await this.getDom().hoverByUid(this.getContext(), uid);
  }

  async fillByUid(uid: string, value: string): Promise<void> {
    return await this.getDom().fillByUid(this.getContext(), uid, value);
  }

  async dragByUidToUid(fromUid: string, toUid: string): Promise<void> {
    return await this.getDom().dragByUidToUid(this.getContext(), fromUid, toUid);
  }

  async fillFormByUid(elements: Array<{ uid: string; value: string }>): Promise<void> {
    return await this.getDom().fillFormByUid(this.getContext(), elements);
  }

  async uploadFileByUid(uid: string, filePath: string): Promise<void> {
    return await this.getDom().uploadFileByUid(this.getContext(), uid, filePath);
  }

  async pressKey(key: string, uid?: string): Promise<void> {
    return await this.getDom().pressKey(this.getContext(), key, uid);
  }

  async typeText(
    text: string,
    options?: { uid?: string | undefined; submitKey?: string | undefined }
  ): Promise<void> {
    return await this.getDom().typeText(this.getContext(), text, options);
  }

  // ============================================================================
  // Console
  // ============================================================================

  async getConsoleMessages(): Promise<ConsoleMessage[]> {
    if (!this.consoleEvents) {
      throw new Error(
        'Console events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    return this.consoleEvents.getMessages();
  }

  clearConsoleMessages(): void {
    if (!this.consoleEvents) {
      throw new Error(
        'Console events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    this.consoleEvents.clearMessages();
  }

  // ============================================================================
  // Pages / Navigation
  // ============================================================================

  async navigate(url: string, wait?: BrowsingContext.ReadinessState): Promise<void> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    await this.pages.navigate(url, wait);
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

  async createNewPage(url: string, wait?: BrowsingContext.ReadinessState): Promise<number> {
    if (!this.pages) {
      throw new Error('Not connected');
    }
    return await this.pages.createNewPage(url, wait);
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

  async setCacheBehavior(behavior: CacheBehavior, options?: { global?: boolean }): Promise<void> {
    if (!this.cache) {
      throw new Error('Not connected');
    }
    await this.cache.setCacheBehavior(behavior, options);
  }

  async startNetworkMonitoring(): Promise<void> {
    if (!this.networkEvents) {
      throw new Error(
        'Network events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    this.networkEvents.startMonitoring();
  }

  async stopNetworkMonitoring(): Promise<void> {
    if (!this.networkEvents) {
      throw new Error(
        'Network events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    this.networkEvents.stopMonitoring();
  }

  async getNetworkRequests(): Promise<any[]> {
    if (!this.networkEvents) {
      throw new Error(
        'Network events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    return this.networkEvents.getRequests();
  }

  clearNetworkRequests(): void {
    if (!this.networkEvents) {
      throw new Error(
        'Network events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    this.networkEvents.clearRequests();
  }

  /**
   * Fetch a captured request or response body for a given request id.
   * Returns a structured result describing the body or why it is unavailable.
   */
  async getNetworkRequestBody(
    requestId: string,
    dataType: Network.DataType
  ): Promise<NetworkBodyResult> {
    if (!this.networkEvents) {
      throw new Error(
        'Network events not available (Firefox Remote Agent not running — start Firefox with --remote-debugging-port to enable BiDi)'
      );
    }
    return this.networkEvents.fetchBody(requestId, dataType);
  }

  // ============================================================================
  // Downloads
  // ============================================================================

  getDownloads(): any[] {
    if (!this.downloadEvents) {
      throw new Error(
        'Download tracking not available (requires a recent Firefox with the Remote Agent running to enable BiDi)'
      );
    }
    return this.downloadEvents.getDownloads();
  }

  clearDownloads(): void {
    if (!this.downloadEvents) {
      throw new Error(
        'Download tracking not available (requires a recent Firefox with the Remote Agent running to enable BiDi)'
      );
    }
    this.downloadEvents.clearDownloads();
  }

  /**
   * Control how downloads are handled via the browser.setDownloadBehavior BiDi command.
   * @param behavior 'allowed' saves downloads to `downloadFolder`, 'denied' cancels them, 'default' resets
   * @param downloadFolder the download folder to use for behavior=allowed
   */
  async setDownloadBehavior(behavior: 'allowed', downloadFolder: string): Promise<void>;
  async setDownloadBehavior(behavior: 'denied' | 'default'): Promise<void>;
  async setDownloadBehavior(
    behavior: 'allowed' | 'denied' | 'default',
    downloadFolder?: string
  ): Promise<void> {
    let downloadBehavior: Browser.DownloadBehavior | null = null;
    if (behavior === 'allowed') {
      if (!downloadFolder) {
        throw new Error('downloadFolder is required for behavior "allowed"');
      }
      downloadBehavior = { type: 'allowed', destinationFolder: downloadFolder };
    } else if (behavior === 'denied') {
      downloadBehavior = { type: 'denied' };
    }
    await this.getBidi().sendCommand('browser.setDownloadBehavior', { downloadBehavior });
  }

  // ============================================================================
  // Snapshot
  // ============================================================================

  async takeSnapshot(options?: SnapshotOptions): Promise<Snapshot> {
    return await this.getSnapshot().takeSnapshot(this.getContext(), options);
  }

  async resolveUidToSelector(uid: string): Promise<string> {
    return await this.getSnapshot().resolveUidToSelector(this.getContext(), uid);
  }

  async resolveUidToElement(uid: string): Promise<Script.SharedReference> {
    return await this.getSnapshot().resolveUidToElement(this.getContext(), uid);
  }

  async clearSnapshot(): Promise<void> {
    await this.getSnapshot().clear(this.getContext());
  }

  // ============================================================================
  // Screenshot
  // ============================================================================

  /**
   * @param fullPage Capture the whole scrollable document instead of the viewport
   */
  async takeScreenshotPage(fullPage = false): Promise<string> {
    return await this.getDom().takeScreenshotPage(this.getContext(), fullPage);
  }

  async takeScreenshotByUid(uid: string): Promise<string> {
    return await this.getDom().takeScreenshotByUid(this.getContext(), uid);
  }

  // ============================================================================
  // Internal / Advanced
  // ============================================================================

  /**
   * Send raw BiDi command (for advanced operations)
   * @internal
   */
  sendBiDiCommand: BiDiFacade['sendCommand'] = (method, params) =>
    this.getBidi().sendCommand(method, params);

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
   * Update current browsing context ID
   * @internal
   */
  setCurrentContextId(contextId: string): void {
    this.core.setCurrentContextId(contextId);
  }

  /**
   * Ensure Firefox is still connected with a usable tab selected.
   * If the previously selected tab is gone, recovers by switching to another
   * tab or opening a new one. Returns false if the connection is unrecoverable.
   */
  async ensureConnected(): Promise<boolean> {
    return await this.core.ensureConnected();
  }

  /**
   * Get current browser version (eg "153.0a1").
   * @internal
   */
  getFirefoxVersion(): string | null {
    return this.core.getFirefoxVersion();
  }

  /**
   * @internal
   */
  async setLogpoint(url: string, line: number, expression: string): Promise<string> {
    if (!this.debuggingEvents) {
      throw new Error('Debugging events not available');
    }
    const result = await this.getBidi().sendCommand('moz:debugging.setBreakpoint', {
      location: { url, line },
    });
    const logpointId = result.breakpoint;
    this.debuggingEvents.addLogpoint(logpointId, url, line, expression);
    return logpointId;
  }

  /**
   * @internal
   */
  async removeLogpoint(logpointId: string): Promise<void> {
    if (!this.debuggingEvents) {
      throw new Error('Debugging events not available');
    }
    await this.getBidi().sendCommand('moz:debugging.removeBreakpoint', {
      breakpoint: logpointId,
    });
    this.debuggingEvents.removeLogpoint(logpointId);
  }

  /**
   * @internal
   */
  getLogpointResults(logpointId: string): LogpointResult[] | null {
    if (!this.debuggingEvents) {
      return null;
    }
    return this.debuggingEvents.getLogpointResults(logpointId);
  }

  /**
   * Get log file path (if logging is enabled)
   */
  getLogFilePath(): string | undefined {
    return this.core.getLogFilePath();
  }

  /**
   * Get and clear the profile warning generated during connect() (if any).
   * Consumed once so the MCP client surfaces it to the user in the first tool response.
   */
  getAndClearProfileWarning(): string | null {
    return this.core.getAndClearProfileWarning();
  }

  /**
   * Get current launch options
   */
  getOptions(): FirefoxLaunchOptions {
    return this.core.getOptions();
  }

  /** Binary auto-detected at launch, when the caller supplied no --firefox-path. */
  getDetectedBinaryPath(): string | undefined {
    return this.core.getDetectedBinaryPath();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async close(): Promise<void> {
    try {
      await this.core.close();
    } catch (error) {
      logDebug(`close() failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.consoleEvents = null;
    this.networkEvents = null;
    this.debuggingEvents = null;
    this.downloadEvents = null;
    this.dom = null;
    this.pages = null;
    this.cache = null;
    this.snapshot = null;
  }
}

// Re-export types
export type { Snapshot } from './snapshot/index.js';

// Re-export for backward compatibility
export { FirefoxClient as FirefoxDevTools };
