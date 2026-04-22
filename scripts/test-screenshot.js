#!/usr/bin/env node

/**
 * Test script for screenshot functionality (Task 22)
 * Tests: takeScreenshotPage, takeScreenshotByUid
 * Saves screenshots to temp/ directory for visual inspection
 */

import { FirefoxDevTools } from '../dist/index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  loadHTML,
  waitShort,
  shouldRunOnlineTests,
  skipOnlineTest,
} from './_helpers/page-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMP_DIR = join(__dirname, '../temp');

async function saveScreenshot(base64Data, filename) {
  // Ensure temp directory exists
  await mkdir(TEMP_DIR, { recursive: true });

  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Data, 'base64');
  const filepath = join(TEMP_DIR, filename);
  await writeFile(filepath, buffer);

  console.log(`   💾 Saved: ${filepath} (${(buffer.length / 1024).toFixed(2)} KB)`);
  return filepath;
}

async function main() {
  console.log('📷 Testing Screenshot Functionality...\n');

  const firefox = new FirefoxDevTools({
    firefoxPath: process.env.FIREFOX_PATH,
    headless: false,
    startUrl: 'about:blank',
  });

  try {
    console.log('📡 Connecting to Firefox...');
    await firefox.connect();
    console.log('✅ Connected!\n');

    // Online tests (optional)
    if (shouldRunOnlineTests()) {
      // Test 1: Screenshot of example.com
      console.log('🌐 Test 1: Full page screenshot (example.com)');
      await firefox.navigate('https://example.com');
      await waitShort(2000);

      const examplePageScreenshot = await firefox.takeScreenshotPage();
      await saveScreenshot(examplePageScreenshot, 'screenshot-example-page.png');
      console.log(`   ✅ Screenshot captured (${examplePageScreenshot.length} chars base64)\n`);

      // Test 2: Screenshot of specific element (heading)
      console.log('🎯 Test 2: Element screenshot (h1 heading)');
      const snapshot1 = await firefox.takeSnapshot();
      const h1Node = snapshot1.json.root.children?.find((n) => n.tag === 'h1');

      if (h1Node && h1Node.uid) {
        console.log(`   Found: <h1> with UID ${h1Node.uid}`);
        const h1Screenshot = await firefox.takeScreenshotByUid(h1Node.uid);
        await saveScreenshot(h1Screenshot, 'screenshot-example-h1.png');
        console.log(`   ✅ Element screenshot captured (${h1Screenshot.length} chars base64)\n`);
      } else {
        console.log('   ⚠️ No h1 element found\n');
      }
    } else {
      skipOnlineTest('Online screenshot tests (example.com)');
    }

    // Test 3: Custom HTML page with styled elements (OFFLINE)
    console.log('🎨 Test 3: Custom styled page (offline)');

    await loadHTML(
      firefox,
      `
<head><title>Screenshot Test</title><style>
body { font-family: Arial; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; min-height: 100vh; }
.card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 600px; margin: 0 auto; }
h1 { color: #667eea; margin: 0 0 20px 0; font-size: 36px; }
.button { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; display: inline-block; margin: 10px 5px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
.button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6); }
p { color: #555; line-height: 1.6; font-size: 16px; }
</style></head><body>
<div class="card">
<h1 id="title">🎯 Screenshot Test Page</h1>
<p id="description">This is a beautifully styled test page for screenshot functionality. The gradient background and card design showcase visual capture capabilities.</p>
<button class="button" id="btn1">Primary Action</button>
<button class="button" id="btn2">Secondary Action</button>
</div>
</body>
`
    );

    await waitShort(500);

    const customPageScreenshot = await firefox.takeScreenshotPage();
    await saveScreenshot(customPageScreenshot, 'screenshot-custom-page.png');
    console.log(`   ✅ Full page screenshot captured\n`);

    // Test 4: Screenshot of styled elements using UID
    console.log('🎨 Test 4: Individual styled elements (via UID)');

    const snapshot = await firefox.takeSnapshot();

    // Find h1 element
    const findElement = (node, tag) => {
      if (node.tag === tag) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = findElement(child, tag);
          if (found) return found;
        }
      }
      return null;
    };

    const h1 = findElement(snapshot.json.root, 'h1');
    if (h1 && h1.uid) {
      const h1Screenshot = await firefox.takeScreenshotByUid(h1.uid);
      await saveScreenshot(h1Screenshot, 'screenshot-custom-h1.png');
      console.log(`   ✅ H1 screenshot captured via UID`);
    }

    // Find first button
    const button = findElement(snapshot.json.root, 'button');
    if (button && button.uid) {
      const buttonScreenshot = await firefox.takeScreenshotByUid(button.uid);
      await saveScreenshot(buttonScreenshot, 'screenshot-custom-button.png');
      console.log(`   ✅ Button screenshot captured via UID\n`);
    }

    // Test 5: Screenshot using direct CSS selectors (fallback method)
    console.log('🎨 Test 5: Individual styled elements (via CSS selectors)');

    try {
      // Get element via evaluate and take screenshot using WebDriver directly
      const driver = firefox.getDriver();

      // Screenshot title
      const titleEl = await driver.findElement({ css: '#title' });
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', titleEl);
      await waitShort(200);
      const titleScreenshot = await titleEl.takeScreenshot();
      await saveScreenshot(titleScreenshot, 'screenshot-custom-title.png');
      console.log(`   ✅ Title screenshot captured`);

      // Screenshot second button (avoid conflict with UID test)
      const buttonEl = await driver.findElement({ css: '#btn2' });
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', buttonEl);
      await waitShort(200);
      const buttonScreenshot = await buttonEl.takeScreenshot();
      await saveScreenshot(buttonScreenshot, 'screenshot-custom-button2.png');
      console.log(`   ✅ Button screenshot captured`);

      // Screenshot card container
      const cardEl = await driver.findElement({ css: '.card' });
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', cardEl);
      await waitShort(200);
      const cardScreenshot = await cardEl.takeScreenshot();
      await saveScreenshot(cardScreenshot, 'screenshot-custom-card.png');
      console.log(`   ✅ Card screenshot captured\n`);
    } catch (error) {
      console.log(`   ⚠️ Element screenshot failed: ${error.message}\n`);
    }

    console.log('✅ All screenshot tests completed! 🎉');
    console.log(`\n📁 Screenshots saved to: ${TEMP_DIR}\n`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('🧹 Closing...');
    await firefox.close();
    console.log('✅ Done');
  }
}

main().catch(console.error);
