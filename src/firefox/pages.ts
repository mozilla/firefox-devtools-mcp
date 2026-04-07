/**
 * Page/Tab/Window management
 */

import { WebDriver } from 'selenium-webdriver';
import { log } from '../utils/logger.js';

export class PageManagement {
  constructor(
    private driver: WebDriver,
    private getCurrentContextId: () => string | null,
    private setCurrentContextId: (id: string) => void
  ) {}

  /**
   * Navigate to URL
   */
  async navigate(url: string): Promise<void> {
    await this.driver.get(url);
    log(`Navigated to: ${url}`);
  }

  /**
   * Navigate back in history
   */
  async navigateBack(): Promise<void> {
    await this.driver.navigate().back();
  }

  /**
   * Navigate forward in history
   */
  async navigateForward(): Promise<void> {
    await this.driver.navigate().forward();
  }

  /**
   * Set viewport size
   */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.driver.manage().window().setRect({ width, height });
  }

  /**
   * Accept dialog (alert/confirm/prompt)
   * @param promptText - Optional text to enter in prompt dialog
   */
  async acceptDialog(promptText?: string): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      if (promptText !== undefined) {
        await alert.sendKeys(promptText);
      }
      await alert.accept();
    } catch (error) {
      throw new Error(
        `Failed to accept dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Dismiss dialog (alert/confirm/prompt)
   */
  async dismissDialog(): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      await alert.dismiss();
    } catch (error) {
      throw new Error(
        `Failed to dismiss dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private cachedTabs: Array<{ actor: string; title: string; url: string }> = [];
  private cachedSelectedIdx: number = 0;

  /**
   * Get all tabs (window handles)
   */
  getTabs(): Array<{ actor: string; title: string; url: string }> {
    return this.cachedTabs;
  }

  /**
   * Get selected tab index
   */
  getSelectedTabIdx(): number {
    return this.cachedSelectedIdx;
  }

  /**
   * Refresh tabs metadata - fetches all window handles and their URLs/titles
   */
  async refreshTabs(): Promise<void> {
    try {
      const handles = await this.driver.getAllWindowHandles();
      const currentHandle = await this.driver.getWindowHandle();

      this.cachedTabs = [];
      this.cachedSelectedIdx = 0;

      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i]!;

        // Switch to window to get its URL and title
        await this.driver.switchTo().window(handle);
        const url = await this.driver.getCurrentUrl();
        const title = await this.driver.getTitle();

        this.cachedTabs.push({
          actor: handle,
          title: title || 'Untitled',
          url: url || 'about:blank',
        });

        // Track which tab is selected
        if (handle === currentHandle) {
          this.cachedSelectedIdx = i;
        }
      }

      // Switch back to the original window
      await this.driver.switchTo().window(currentHandle);
    } catch (error) {
      log(`Error refreshing tabs: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback to single tab
      const currentId = this.getCurrentContextId();
      this.cachedTabs = [
        {
          actor: currentId || '',
          title: 'Current Tab',
          url: '',
        },
      ];
      this.cachedSelectedIdx = 0;
    }
  }

  /**
   * Select tab by index
   */
  async selectTab(index: number): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (index >= 0 && index < handles.length) {
      await this.driver.switchTo().window(handles[index]!);
      this.setCurrentContextId(handles[index]!);
      this.cachedSelectedIdx = index;
    }
  }

  /**
   * Create new page (tab)
   */
  async createNewPage(url: string): Promise<number> {
    await this.driver.switchTo().newWindow('tab');
    const handles = await this.driver.getAllWindowHandles();
    const newIdx = handles.length - 1;
    this.setCurrentContextId(handles[newIdx]!);
    this.cachedSelectedIdx = newIdx;
    await this.driver.get(url);
    return newIdx;
  }

  /**
   * Close tab by index
   */
  async closeTab(index: number): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (index >= 0 && index < handles.length) {
      await this.driver.switchTo().window(handles[index]!);
      await this.driver.close();
      const remaining = await this.driver.getAllWindowHandles();
      if (remaining.length > 0) {
        await this.driver.switchTo().window(remaining[0]!);
        this.setCurrentContextId(remaining[0]!);
      }
    }
  }
}
