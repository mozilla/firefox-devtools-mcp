#!/usr/bin/env node
/**
 * Windows Integration Tests Runner
 *
 * Runs integration tests directly via node to avoid vitest fork issues on Windows.
 * See: https://github.com/mozilla/firefox-devtools-mcp/issues/33
 */

import { FirefoxDevTools } from '../dist/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = resolve(__dirname, '../tests/fixtures');

let firefox = null;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('\x1b[32m✓\x1b[0m');
    passed++;
  } catch (error) {
    console.log('\x1b[31m✗\x1b[0m');
    console.error(`    Error: ${error.message}`);
    failed++;
  }
}

async function setup() {
  console.log('\n🚀 Starting Firefox...');
  firefox = new FirefoxDevTools({
    headless: true,
    enableBidiLogging: false,
    width: 1280,
    height: 720,
  });
  await firefox.connect();
  console.log('✅ Firefox connected\n');
}

async function teardown() {
  if (firefox) {
    await firefox.close();
    console.log('\n✅ Firefox closed');
  }
}

// ============================================================================
// Tab Management Tests
// ============================================================================
async function tabTests() {
  console.log('📋 Tab Management Tests:');

  await test('should list tabs', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await firefox.refreshTabs();
    const tabs = firefox.getTabs();
    assert(Array.isArray(tabs), 'tabs should be an array');
    assert(tabs.length > 0, 'should have at least one tab');
  });

  await test('should create new tab', async () => {
    await firefox.refreshTabs();
    const initialTabs = firefox.getTabs();
    const initialCount = initialTabs.length;

    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.createNewPage(fixturePath);

    await firefox.refreshTabs();
    const updatedTabs = firefox.getTabs();
    assert(updatedTabs.length === initialCount + 1, 'should have one more tab');
  });

  await test('should get selected tab index', async () => {
    const idx = firefox.getSelectedTabIdx();
    assert(typeof idx === 'number', 'index should be a number');
    assert(idx >= 0, 'index should be non-negative');
  });
}

// ============================================================================
// Snapshot Tests
// ============================================================================
async function snapshotTests() {
  console.log('\n📸 Snapshot Tests:');

  await test('should take snapshot', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);
    await new Promise((r) => setTimeout(r, 500));

    const snapshot = await firefox.takeSnapshot();
    assert(snapshot, 'snapshot should exist');
    assert(snapshot.text || snapshot.markdown, 'snapshot should have text or markdown');
    assert(snapshot.json, 'snapshot should have json');
  });

  await test('should have uidMap in snapshot', async () => {
    const snapshot = await firefox.takeSnapshot();
    assert(Array.isArray(snapshot.json.uidMap), 'uidMap should be an array');
  });
}

// ============================================================================
// Console Tests
// ============================================================================
async function consoleTests() {
  console.log('\n💬 Console Tests:');

  await test('should get console messages', async () => {
    const messages = await firefox.getConsoleMessages();
    assert(Array.isArray(messages), 'messages should be an array');
  });

  await test('should clear console messages', async () => {
    firefox.clearConsoleMessages();
    const messages = await firefox.getConsoleMessages();
    assert(messages.length === 0, 'messages should be empty after clear');
  });
}

// ============================================================================
// Network Tests
// ============================================================================
async function networkTests() {
  console.log('\n🌐 Network Tests:');

  await test('should start network monitoring', async () => {
    await firefox.startNetworkMonitoring();
    // No error means success
    assert(true);
  });

  await test('should get network requests', async () => {
    const requests = await firefox.getNetworkRequests();
    assert(Array.isArray(requests), 'requests should be an array');
  });

  await test('should clear network requests', async () => {
    firefox.clearNetworkRequests();
    const requests = await firefox.getNetworkRequests();
    assert(requests.length === 0, 'requests should be empty after clear');
  });

  await test('should stop network monitoring', async () => {
    await firefox.stopNetworkMonitoring();
    assert(true);
  });
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Windows Integration Tests (direct node runner)');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await setup();

    await tabTests();
    await snapshotTests();
    await consoleTests();
    await networkTests();

    await teardown();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    await teardown();
    process.exit(1);
  }
}

main();
