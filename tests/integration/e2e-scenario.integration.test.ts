/**
 * E2E Scenario Integration Tests
 *
 * Comprehensive end-to-end tests exercising the full FirefoxClient API
 * against a realistic multi-page web application (e2e-app.html fixture).
 *
 * Coverage:
 * - Snapshot & UID workflow (take snapshot, find elements, resolve UIDs)
 * - Click, double-click, hover by UID
 * - Form filling (single field + batch fillFormByUid)
 * - JavaScript evaluation via evaluate()
 * - Multi-page SPA navigation via click
 * - Browser history (navigateBack / navigateForward)
 * - Viewport resize
 * - Search workflow (fill + click + verify results)
 * - Console message monitoring
 * - Screenshot capture
 * - Tab management (create, switch, close)
 * - Stale UID detection after navigation
 * - Error handling (invalid UID, unknown UID)
 * - Network monitoring
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
  waitForPageLoad,
  waitFor,
} from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');
const appUrl = `file://${fixturesPath}/e2e-app.html`;

// ---------------------------------------------------------------------------
// Todo App Workflow
// ---------------------------------------------------------------------------

describe('E2E Scenario: Todo App Workflow', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should load the app and take initial snapshot', async () => {
    const snapshot = await firefox.takeSnapshot();

    expect(snapshot.text).toContain('E2E Test Application');
    expect(snapshot.json.uidMap.length).toBeGreaterThan(0);

    const statusEl = snapshot.json.uidMap.find((e) => e.css.includes('#status'));
    expect(statusEl).toBeDefined();
  }, 10000);

  it('should add todo items via UID-based interaction', async () => {
    const todoInput = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#todoInput'),
      5000
    );

    await firefox.fillByUid(todoInput.uid, 'Write BiDi tests');

    const addBtn = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#addTodoBtn'),
      5000
    );
    await firefox.clickByUid(addBtn.uid);
    await waitForPageLoad(200);

    // Add second todo
    const snapshot2 = await firefox.takeSnapshot();
    const todoInput2 = snapshot2.json.uidMap.find((e) => e.css.includes('#todoInput'));
    await firefox.fillByUid(todoInput2!.uid, 'Review PR');
    const addBtn2 = snapshot2.json.uidMap.find((e) => e.css.includes('#addTodoBtn'));
    await firefox.clickByUid(addBtn2!.uid);
    await waitForPageLoad(200);

    const snapshot3 = await firefox.takeSnapshot();
    expect(snapshot3.text).toContain('Write BiDi tests');
    expect(snapshot3.text).toContain('Review PR');
    expect(snapshot3.text).toContain('2 items');
  }, 20000);

  it('should evaluate JavaScript to check app state', async () => {
    const result = await firefox.evaluate('return document.getElementById("status").textContent');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  }, 10000);
});

// ---------------------------------------------------------------------------
// Click, Double-Click, Hover
// ---------------------------------------------------------------------------

describe('E2E Scenario: Click Interactions', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should double-click element by UID', async () => {
    const dblBtn = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#dblClickTarget'),
      5000
    );

    await firefox.clickByUid(dblBtn.uid, true);
    await waitForPageLoad(200);

    const result = await firefox.evaluate(
      'return document.getElementById("dblClickResult").textContent'
    );
    expect(result).toBe('Double-clicked!');
  }, 15000);

  it('should hover over element by UID', async () => {
    const hoverBtn = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#hoverTarget'),
      5000
    );

    await firefox.hoverByUid(hoverBtn.uid);
    await waitForPageLoad(200);

    const result = await firefox.evaluate(
      'return document.getElementById("hoverResult").textContent'
    );
    expect(result).toBe('Hovered!');
  }, 15000);
});

// ---------------------------------------------------------------------------
// Multi-Page Navigation
// ---------------------------------------------------------------------------

describe('E2E Scenario: Multi-Page Navigation', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should navigate between pages using nav buttons', async () => {
    // Go to Search
    const searchNav = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#navSearch'),
      5000
    );
    await firefox.clickByUid(searchNav.uid);
    await waitForPageLoad(200);

    let snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Search');

    // Go to Registration
    const formNav = snapshot.json.uidMap.find((e) => e.css.includes('#navForm'));
    await firefox.clickByUid(formNav!.uid);
    await waitForPageLoad(200);

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Registration');

    // Back to Todo
    const todoNav = snapshot.json.uidMap.find((e) => e.css.includes('#navTodo'));
    await firefox.clickByUid(todoNav!.uid);
    await waitForPageLoad(200);

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Todo List');
  }, 20000);
});

// ---------------------------------------------------------------------------
// Browser History (navigateBack / navigateForward)
// ---------------------------------------------------------------------------

describe('E2E Scenario: Browser History', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should navigate back and forward between pages', async () => {
    // Navigate to page A
    await firefox.navigate(appUrl);
    await waitForPageLoad();

    let snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('E2E Test Application');

    // Navigate to page B
    const simpleUrl = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(simpleUrl);
    await waitForPageLoad();

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Simple Test Page');

    // Go back to page A
    await firefox.navigateBack();
    await waitForPageLoad();

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('E2E Test Application');

    // Go forward to page B
    await firefox.navigateForward();
    await waitForPageLoad();

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Simple Test Page');
  }, 30000);
});

// ---------------------------------------------------------------------------
// Viewport Resize
// ---------------------------------------------------------------------------

describe('E2E Scenario: Viewport Resize', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should resize viewport and verify dimensions change', async () => {
    // setViewportSize calls window().setRect() which sets the outer window size.
    // innerWidth/innerHeight may differ due to browser chrome/toolbar offset,
    // so we assert relative change rather than exact pixel values.

    await firefox.setViewportSize(800, 600);
    await waitForPageLoad(200);

    const smallWidth = (await firefox.evaluate('return window.innerWidth')) as number;
    const smallHeight = (await firefox.evaluate('return window.innerHeight')) as number;

    await firefox.setViewportSize(1200, 900);
    await waitForPageLoad(200);

    const largeWidth = (await firefox.evaluate('return window.innerWidth')) as number;
    const largeHeight = (await firefox.evaluate('return window.innerHeight')) as number;

    // Viewport should have grown in both dimensions
    expect(largeWidth).toBeGreaterThan(smallWidth);
    expect(largeHeight).toBeGreaterThan(smallHeight);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Search Workflow
// ---------------------------------------------------------------------------

describe('E2E Scenario: Search Workflow', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should search and display results', async () => {
    const searchNav = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#navSearch'),
      5000
    );
    await firefox.clickByUid(searchNav.uid);
    await waitForPageLoad(200);

    let snapshot = await firefox.takeSnapshot();
    const searchInput = snapshot.json.uidMap.find((e) => e.css.includes('#searchInput'));
    await firefox.fillByUid(searchInput!.uid, 'bidi');

    const searchBtn = snapshot.json.uidMap.find((e) => e.css.includes('#searchBtn'));
    await firefox.clickByUid(searchBtn!.uid);
    await waitForPageLoad(200);

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Bidirectional protocol');
  }, 15000);

  it('should show no results for unknown query', async () => {
    // Self-contained: navigate to search page first
    const searchNav = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#navSearch'),
      5000
    );
    await firefox.clickByUid(searchNav.uid);
    await waitForPageLoad(200);

    let snapshot = await firefox.takeSnapshot();
    const searchInput = snapshot.json.uidMap.find((e) => e.css.includes('#searchInput'));

    await firefox.fillByUid(searchInput!.uid, 'nonexistent-xyz');

    const searchBtn = snapshot.json.uidMap.find((e) => e.css.includes('#searchBtn'));
    await firefox.clickByUid(searchBtn!.uid);
    await waitForPageLoad(200);

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('No results found');
  }, 15000);
});

// ---------------------------------------------------------------------------
// Form Submission
// ---------------------------------------------------------------------------

describe('E2E Scenario: Form Submission', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should fill and submit registration form', async () => {
    const formNav = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#navForm'),
      5000
    );
    await firefox.clickByUid(formNav.uid);
    await waitForPageLoad(200);

    let snapshot = await firefox.takeSnapshot();

    const nameInput = snapshot.json.uidMap.find((e) => e.css.includes('#regName'));
    const emailInput = snapshot.json.uidMap.find((e) => e.css.includes('#regEmail'));
    const bioInput = snapshot.json.uidMap.find((e) => e.css.includes('#regBio'));
    const submitBtn = snapshot.json.uidMap.find((e) => e.css.includes('#regSubmitBtn'));

    await firefox.fillByUid(nameInput!.uid, 'Tomas Grasl');
    await firefox.fillByUid(emailInput!.uid, 'tomas@example.com');
    await firefox.fillByUid(bioInput!.uid, 'Firefox DevTools MCP contributor');

    await firefox.clickByUid(submitBtn!.uid);
    await waitForPageLoad(300);

    snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Registered');
    expect(snapshot.text).toContain('Tomas Grasl');
  }, 20000);

  it('should use fillFormByUid for batch form filling', async () => {
    await firefox.navigate(appUrl);
    await waitForPageLoad();

    const formNav = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#navForm'),
      5000
    );
    await firefox.clickByUid(formNav.uid);
    await waitForPageLoad(200);

    let snapshot = await firefox.takeSnapshot();

    const nameInput = snapshot.json.uidMap.find((e) => e.css.includes('#regName'));
    const emailInput = snapshot.json.uidMap.find((e) => e.css.includes('#regEmail'));

    await firefox.fillFormByUid([
      { uid: nameInput!.uid, value: 'Julian Descottes' },
      { uid: emailInput!.uid, value: 'julian@mozilla.com' },
    ]);

    const nameValue = await firefox.evaluate('return document.getElementById("regName").value');
    expect(nameValue).toBe('Julian Descottes');

    const emailValue = await firefox.evaluate('return document.getElementById("regEmail").value');
    expect(emailValue).toBe('julian@mozilla.com');
  }, 20000);
});

// ---------------------------------------------------------------------------
// Console Monitoring
// ---------------------------------------------------------------------------

describe('E2E Scenario: Console Monitoring', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should capture console.log messages from the app', async () => {
    // The app logs "[E2E App] Application loaded" on load — wait for it
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((m) => m.text && m.text.includes('[E2E App]'));
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const appLogMessage = messages.find((m) => m.text && m.text.includes('[E2E App]'));
    expect(appLogMessage).toBeDefined();
  }, 10000);

  it('should capture dynamically generated console messages', async () => {
    firefox.clearConsoleMessages();

    await firefox.evaluate('console.log("BiDi test message", 42)');

    // Wait for the BiDi event to arrive asynchronously
    await waitFor(async () => {
      const messages = await firefox.getConsoleMessages();
      return messages.some((m) => m.text && m.text.includes('BiDi test message'));
    }, 5000);

    const messages = await firefox.getConsoleMessages();
    const testMessage = messages.find((m) => m.text && m.text.includes('BiDi test message'));
    expect(testMessage).toBeDefined();
  }, 10000);
});

// ---------------------------------------------------------------------------
// Network Monitoring
// ---------------------------------------------------------------------------

describe('E2E Scenario: Network Monitoring', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.startNetworkMonitoring();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should capture network requests when navigating', async () => {
    firefox.clearNetworkRequests();

    // Navigate to network fixture which has fetch buttons
    const networkUrl = `file://${fixturesPath}/network.html`;
    await firefox.navigate(networkUrl);
    await waitForPageLoad();

    // Click the fetch GET button
    const fetchBtn = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#fetchGet'),
      5000
    );
    await firefox.clickByUid(fetchBtn.uid);

    // Wait for request to be captured
    await waitFor(async () => {
      const requests = await firefox.getNetworkRequests();
      return requests.some((req) => req.url.includes('jsonplaceholder'));
    }, 10000);

    const requests = await firefox.getNetworkRequests();
    const apiRequest = requests.find((req) => req.url.includes('jsonplaceholder'));

    expect(apiRequest).toBeDefined();
    expect(apiRequest?.method).toBe('GET');
  }, 20000);

  it('should clear network requests', async () => {
    // Self-contained: generate a request first
    firefox.clearNetworkRequests();

    const networkUrl = `file://${fixturesPath}/network.html`;
    await firefox.navigate(networkUrl);
    await waitForPageLoad();

    const fetchBtn = await waitForElementInSnapshot(
      firefox,
      (e) => e.css.includes('#fetchGet'),
      5000
    );
    await firefox.clickByUid(fetchBtn.uid);

    await waitFor(async () => {
      const requests = await firefox.getNetworkRequests();
      return requests.some((req) => req.url.includes('jsonplaceholder'));
    }, 10000);

    const requests = await firefox.getNetworkRequests();
    expect(requests.length).toBeGreaterThan(0);

    // Now clear and verify
    firefox.clearNetworkRequests();

    const cleared = await firefox.getNetworkRequests();
    expect(cleared.length).toBe(0);
  }, 25000);
});

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

describe('E2E Scenario: Screenshot', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should take a page screenshot as base64', async () => {
    const screenshot = await firefox.takeScreenshotPage();

    expect(screenshot).toBeDefined();
    expect(typeof screenshot).toBe('string');
    expect(screenshot.length).toBeGreaterThan(100);
  }, 10000);
});

// ---------------------------------------------------------------------------
// Tab Management
// ---------------------------------------------------------------------------

describe('E2E Scenario: Tab Management', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should open a new tab and switch between tabs', async () => {
    const simpleUrl = `file://${fixturesPath}/simple.html`;
    const newTabIndex = await firefox.createNewPage(simpleUrl);
    await waitForPageLoad();

    expect(newTabIndex).toBeGreaterThan(0);

    // Verify new tab
    const snapshot = await firefox.takeSnapshot();
    expect(snapshot.text).toContain('Simple Test Page');

    // Switch back to first tab
    await firefox.selectTab(0);
    await waitForPageLoad(200);

    const snapshot2 = await firefox.takeSnapshot();
    expect(snapshot2.text).toContain('E2E Test Application');

    // Close the second tab
    await firefox.closeTab(newTabIndex);
  }, 20000);

  it('should list tabs correctly', async () => {
    await firefox.refreshTabs();
    const tabs = firefox.getTabs();

    expect(tabs.length).toBeGreaterThanOrEqual(1);

    const currentIdx = firefox.getSelectedTabIdx();
    expect(currentIdx).toBeGreaterThanOrEqual(0);
    expect(currentIdx).toBeLessThan(tabs.length);
  }, 10000);
});

// ---------------------------------------------------------------------------
// Stale UID Detection
// ---------------------------------------------------------------------------

describe('E2E Scenario: Stale UID Detection', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should detect stale UIDs after navigation', async () => {
    await firefox.navigate(appUrl);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();
    const firstUid = snapshot.json.uidMap[0]?.uid;
    expect(firstUid).toBeDefined();

    // Navigate away — UIDs become stale
    await firefox.navigate(`file://${fixturesPath}/simple.html`);
    await waitForPageLoad();

    // Old UID should throw
    await expect(firefox.clickByUid(firstUid!)).rejects.toThrow(/(stale snapshot|UID not found)/);
  }, 20000);

  it('should detect stale UIDs after clearSnapshot()', async () => {
    await firefox.navigate(appUrl);
    await waitForPageLoad();

    const snapshot = await firefox.takeSnapshot();
    const uid = snapshot.json.uidMap[0]?.uid;
    expect(uid).toBeDefined();

    firefox.clearSnapshot();

    await expect(firefox.clickByUid(uid!)).rejects.toThrow();
  }, 15000);
});

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

describe('E2E Scenario: Error Handling', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.navigate(appUrl);
    await waitForPageLoad();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should throw on invalid UID format', async () => {
    await expect(firefox.clickByUid('invalid-no-underscore')).rejects.toThrow(/Invalid UID format/);
  }, 10000);

  it('should throw on unknown UID', async () => {
    // Take a snapshot to set a valid snapshot ID
    const snapshot = await firefox.takeSnapshot();
    const snapshotId = snapshot.json.snapshotId;

    // Use valid format but non-existent UID
    await expect(firefox.clickByUid(`${snapshotId}_nonexistent`)).rejects.toThrow(/UID not found/);
  }, 10000);

  it('should throw on stale snapshot UID', async () => {
    const snapshot = await firefox.takeSnapshot();
    const snapshotId = snapshot.json.snapshotId;

    // Take another snapshot to bump ID
    await firefox.takeSnapshot();

    // Old snapshot ID is now stale
    await expect(firefox.clickByUid(`${snapshotId}_button`)).rejects.toThrow(/stale snapshot/);
  }, 10000);
});
