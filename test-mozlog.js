#!/usr/bin/env node

import { FirefoxDevTools } from './dist/index.js';
import { readFileSync, existsSync } from 'fs';

async function test() {
  console.log('=== Test: MOZ_LOG and Script Injection (headless) ===\n');

  const logFile = '/tmp/firefox-mozlog-test.log';

  const firefox = new FirefoxDevTools({
    headless: true,
    firefoxPath: process.env.HOME + '/firefox/firefox',
    env: {
      MOZ_LOG: 'timestamp,sync,nsHttp:5',
    },
    logFile,
  });

  await firefox.connect();
  console.log('✓ Firefox started in headless mode with MOZ_LOG');
  console.log(`  Log file: ${logFile}`);

  // Test content script evaluation
  console.log('\n--- Testing content script evaluation ---');
  await firefox.navigate('https://example.com');
  console.log('✓ Navigated to example.com');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    const title = await firefox.evaluate('return document.title');
    console.log(`✓ Content script: document.title = "${title}"`);
  } catch (err) {
    console.log(`✗ Content script evaluation failed: ${err.message}`);
  }

  try {
    const url = await firefox.evaluate('return window.location.href');
    console.log(`✓ Content script: window.location.href = "${url}"`);
  } catch (err) {
    console.log(`✗ Failed to access window.location: ${err.message}`);
  }

  try {
    const headings = await firefox.evaluate('return document.querySelectorAll("h1").length');
    console.log(`✓ Content script: found ${headings} h1 elements`);
  } catch (err) {
    console.log(`✗ Failed to query DOM: ${err.message}`);
  }

  // Navigate to another page
  await firefox.navigate('https://mozilla.org');
  console.log('✓ Navigated to mozilla.org');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    const title2 = await firefox.evaluate('return document.title');
    console.log(`✓ Content script: document.title = "${title2}"`);
  } catch (err) {
    console.log(`✗ Content script evaluation failed: ${err.message}`);
  }

  // Check log file
  console.log('\n--- Checking MOZ_LOG output ---');

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await firefox.close();
  console.log('✓ Firefox closed');

  // Give a moment for log file to be flushed
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (existsSync(logFile)) {
    try {
      const logContent = readFileSync(logFile, 'utf8');
      const lines = logContent.split('\n').filter((l) => l.trim());
      console.log(`✓ Log file exists with ${lines.length} lines`);

      // Check for HTTP logging
      const httpLines = lines.filter((l) => l.includes('nsHttp'));
      console.log(`  Found ${httpLines.length} nsHttp log lines`);

      if (httpLines.length > 0) {
        console.log('  Sample HTTP log lines:');
        httpLines.slice(0, 3).forEach((line) => {
          console.log(`    ${line.substring(0, 100)}`);
        });
      }

      // Check for timestamps
      const timestampLines = lines.filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
      console.log(`  Found ${timestampLines.length} timestamped lines`);
    } catch (err) {
      console.log(`✗ Could not read log file: ${err.message}`);
    }
  } else {
    console.log(`✗ Log file does not exist: ${logFile}`);
  }

  console.log('\n✓ All feature tests completed!');
  console.log('\nNote: Privileged context evaluation requires:');
  console.log('  - MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 env var');
  console.log('  - Using restart_firefox tool or npm run inspector');
}

test().catch((err) => {
  console.error('\nTest failed:', err);
  console.error(err.stack);
  process.exit(1);
});
