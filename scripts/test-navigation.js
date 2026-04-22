#!/usr/bin/env node

import { FirefoxDevTools } from '../dist/index.js';

async function test() {
  console.log('=== Test: Start Firefox and navigate ===\n');

  const firefox = new FirefoxDevTools({
    headless: false,
    firefoxPath: process.env.FIREFOX_PATH,
  });

  await firefox.connect();
  console.log('✓ Firefox started');

  await firefox.navigate('https://example.com');
  console.log('✓ Navigated to example.com');

  await new Promise(resolve => setTimeout(resolve, 2000));

  await firefox.navigate('https://mozilla.org');
  console.log('✓ Navigated to mozilla.org');

  await new Promise(resolve => setTimeout(resolve, 2000));

  await firefox.refreshTabs();
  const tabs = firefox.getTabs();
  console.log(`✓ Listed tabs: ${tabs.length} tab(s)`);
  if (tabs.length > 0) {
    console.log(`  Current URL: ${tabs[0].url}`);
    console.log(`  Current title: ${tabs[0].title || 'N/A'}`);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  await firefox.navigate('https://www.w3.org');
  console.log('✓ Navigated to w3.org');

  await new Promise(resolve => setTimeout(resolve, 2000));

  await firefox.refreshTabs();
  const tabsAfter = firefox.getTabs();
  console.log(`✓ Listed tabs again: ${tabsAfter.length} tab(s)`);
  if (tabsAfter.length > 0) {
    console.log(`  Current URL: ${tabsAfter[0].url}`);
  }

  await firefox.close();
  console.log('\n✓ Basic navigation tests passed!');
  console.log('\nNote: To test restart_firefox with logs, use the MCP inspector:');
  console.log('  npm run inspector');
}

test().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
