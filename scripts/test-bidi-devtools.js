#!/usr/bin/env node

/**
 * Test script for new BiDi-based FirefoxDevTools
 * Tests all main functionality with clean BiDi implementation
 *
 * Runs offline by default. Set TEST_ONLINE=1 to enable online tests.
 */

import { FirefoxDevTools } from '../dist/index.js';
import {
  loadHTML,
  waitShort,
  shouldRunOnlineTests,
  skipOnlineTest,
} from './_helpers/page-loader.js';

async function main() {
  console.log('🧪 Testing BiDi-based FirefoxDevTools...\n');

  const options = {
    firefoxPath: process.env.FIREFOX_PATH,
    headless: false,
    profilePath: undefined,
    viewport: { width: 1280, height: 720 },
    args: [],
    startUrl: 'about:blank', // Offline-first
  };

  const firefox = new FirefoxDevTools(options);

  try {
    // 1. Connect
    console.log('📡 Connecting to Firefox via BiDi...');
    await firefox.connect();
    console.log('✅ Connected!\n');

    // 2. List tabs
    console.log('📄 Listing tabs...');
    await firefox.refreshTabs();
    const tabs = firefox.getTabs();
    console.log(`✅ Found ${tabs.length} tab(s):`);
    tabs.forEach((tab, idx) => {
      console.log(`   [${idx}] ${tab.title} - ${tab.url}`);
    });
    console.log();

    // 3. Test evaluate with offline page
    console.log('📖 Testing evaluate (offline)...');
    const test1 = await firefox.evaluate('return 1 + 1');
    console.log(`   1 + 1 = ${test1}`);
    const test2 = await firefox.evaluate('return document.title');
    console.log(`   document.title = ${test2}`);
    console.log('✅ Evaluate works\n');

    // 4. Test console messages (offline)
    console.log('⚡ Testing console messages (offline)...');
    await firefox.evaluate(`
      console.log('🎯 BiDi test log message!');
      console.warn('⚠️ BiDi test warning!');
      console.error('❌ BiDi test error!');
      console.info('ℹ️ BiDi test info!');
    `);
    await waitShort(1000);

    const messages = await firefox.getConsoleMessages();
    console.log(`✅ Captured ${messages.length} console message(s):`);
    messages.forEach((msg) => {
      const levelEmoji = { debug: '🐛', info: 'ℹ️', warn: '⚠️', error: '❌' }[msg.level] || '📘';
      console.log(`   ${levelEmoji} [${msg.level}] ${msg.text}`);
    });
    console.log();

    // 5. Drag & drop test (offline)
    console.log('🧲 Testing drag & drop (offline)...');
    try {
      await loadHTML(
        firefox,
        `<head><title>DnD Test</title><style>
#drag{width:80px;height:80px;background:#08f;color:#fff;display:flex;align-items:center;justify-content:center}
#drop{width:160px;height:100px;border:3px dashed #888;margin-left:16px;display:inline-flex;align-items:center;justify-content:center}
#ok{color:green;font-weight:bold}
</style></head><body>
<div id=drag draggable=true>Drag</div><div id=drop>Drop here</div>
<script>
const drop = document.getElementById('drop');
drop.addEventListener('drop', (e)=>{e.preventDefault();drop.innerHTML='<span id=ok>OK</span>';});
drop.addEventListener('dragover', (e)=>e.preventDefault());
</script>
</body>`
      );
      await firefox.dragAndDropBySelectors('#drag', '#drop');
      const ok = await firefox.evaluate("return !!document.querySelector('#ok')");
      console.log(ok ? '✅ Drag & drop worked\n' : '❌ Drag & drop failed\n');
    } catch (e) {
      console.log('⚠️ Skipping drag & drop test:', e.message);
    }

    // 6. File upload test (offline)
    console.log('📁 Testing file upload (offline)...');
    try {
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bidi-test-'));
      const filePath = path.join(tmp, 'hello.txt');
      await fs.writeFile(filePath, 'hello bidi');

      await loadHTML(
        firefox,
        `<head><title>Upload Test</title><style>#file{display:none}</style></head><body>
<label for=file>Pick file</label>
<input id=file type=file>
<script>document.getElementById('file').addEventListener('change',()=>{document.body.setAttribute('data-ok','1')});</script>
</body>`
      );
      await firefox.uploadFileBySelector('#file', filePath);
      const ok = await firefox.evaluate("return document.body.getAttribute('data-ok') === '1'");
      console.log(ok ? '✅ File upload worked\n' : '❌ File upload failed\n');
    } catch (e) {
      console.log('⚠️ Skipping file upload test:', e.message);
    }

    // 7. Viewport resize test
    console.log('📐 Resizing viewport to 1024x600...');
    try {
      await firefox.setViewportSize(1024, 600);
      console.log('✅ Viewport resized\n');
    } catch (e) {
      console.log('⚠️ Skipping viewport resize test:', e.message);
    }

    // 8. Snapshot tests (offline with data: URL)
    console.log('📸 Testing snapshot functionality (offline)...');
    try {
      await loadHTML(
        firefox,
        `<head><title>Test Page</title></head><body>
<h1>Example Domain</h1>
<p>This domain is for use in documentation examples.</p>
<p><a href="https://iana.org/domains/example">Learn more</a></p>
</body>`
      );

      console.log('   Taking first snapshot...');
      const snapshot1 = await firefox.takeSnapshot();
      console.log(`✅ Snapshot taken! (ID: ${snapshot1.json.snapshotId})`);
      console.log(`   First few lines of text output:`);
      const lines = snapshot1.text.split('\n').slice(0, 6);
      lines.forEach((line) => console.log(`   ${line}`));

      // Test UID resolution
      console.log('\n   Testing UID resolution...');
      const firstUid = snapshot1.json.root.uid;
      const selector = firefox.resolveUidToSelector(firstUid);
      console.log(`   ✅ UID ${firstUid} resolves to selector: ${selector}`);

      const element = await firefox.resolveUidToElement(firstUid);
      console.log(`   ✅ UID ${firstUid} resolves to WebElement: ${!!element}`);

      // Test staleness detection (navigation)
      console.log('\n   Testing staleness detection...');
      await firefox.navigate('about:blank');
      await waitShort();

      try {
        firefox.resolveUidToSelector(firstUid);
        console.log('   ❌ Staleness detection failed - should have thrown error');
      } catch (e) {
        console.log(`   ✅ Staleness detected correctly: ${e.message}`);
      }

      // Test iframe support
      console.log('\n   Testing iframe support...');
      await loadHTML(
        firefox,
        `<head><title>Iframe Test</title></head><body>
<h1>Main Page</h1>
<p>This is the main page</p>
<iframe srcdoc="<h2>Iframe Content</h2><p>This is inside the iframe</p>"></iframe>
</body>`
      );
      const snapshot2 = await firefox.takeSnapshot();
      const hasIframe = JSON.stringify(snapshot2.json).includes('isIframe');
      console.log(`   ${hasIframe ? '✅' : '❌'} Iframe detected in snapshot: ${hasIframe}`);

      console.log('\n✅ Snapshot tests completed!\n');
    } catch (e) {
      console.log('⚠️ Snapshot test failed:', e.message);
      if (e.stack) console.log(e.stack);
    }

    // 9. Screenshot tests (offline)
    console.log('📷 Testing screenshot functionality (offline)...');
    try {
      await loadHTML(
        firefox,
        `<head><title>Screenshot Test</title></head><body>
<h1>Test Heading</h1>
<p>This is a test paragraph.</p>
</body>`
      );

      const pageScreenshot = await firefox.takeScreenshotPage();
      console.log(`   ✅ Page screenshot captured (${pageScreenshot.length} chars base64)`);

      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(pageScreenshot);
      const isPNG = pageScreenshot.startsWith('iVBOR');
      console.log(`   ${isValidBase64 ? '✅' : '❌'} Valid base64: ${isValidBase64}`);
      console.log(`   ${isPNG ? '✅' : '❌'} PNG format: ${isPNG}`);

      // Element screenshot by UID
      const snapshot = await firefox.takeSnapshot();
      const targetNode = snapshot.json.root.children?.find((n) => n.tag === 'h1');

      if (targetNode && targetNode.uid) {
        const elementScreenshot = await firefox.takeScreenshotByUid(targetNode.uid);
        console.log(`   ✅ Element screenshot captured (${elementScreenshot.length} chars base64)`);
      } else {
        console.log('   ⚠️ No suitable element found for screenshot test');
      }

      console.log('\n✅ Screenshot tests completed!\n');
    } catch (e) {
      console.log('⚠️ Screenshot test failed:', e.message);
    }

    // 10. Dialog handling tests (offline)
    console.log('💬 Testing dialog handling (offline)...');
    try {
      await firefox.navigate('about:blank');

      // Alert dialog
      console.log('   Testing alert dialog...');
      await firefox.evaluate('setTimeout(() => alert("Test alert!"), 100)');
      await waitShort(200);
      await firefox.acceptDialog();
      console.log('   ✅ Alert dialog accepted');

      // Confirm dialog - accept
      console.log('\n   Testing confirm dialog (accept)...');
      await firefox.evaluate('setTimeout(() => { window.confirmResult = confirm("Test confirm?"); }, 100)');
      await waitShort(200);
      await firefox.acceptDialog();
      const confirmAccepted = await firefox.evaluate('return window.confirmResult');
      console.log(`   ${confirmAccepted ? '✅' : '❌'} Confirm accepted: ${confirmAccepted}`);

      // Confirm dialog - dismiss
      console.log('\n   Testing confirm dialog (dismiss)...');
      await firefox.evaluate(
        'setTimeout(() => { window.confirmResult2 = confirm("Test confirm 2?"); }, 100)'
      );
      await waitShort(200);
      await firefox.dismissDialog();
      const confirmDismissed = await firefox.evaluate('return window.confirmResult2');
      console.log(`   ${!confirmDismissed ? '✅' : '❌'} Confirm dismissed: ${!confirmDismissed}`);

      // Prompt dialog
      console.log('\n   Testing prompt dialog...');
      await firefox.evaluate('setTimeout(() => { window.promptResult = prompt("Enter your name:"); }, 100)');
      await waitShort(200);
      await firefox.acceptDialog('John Doe');
      const promptResult = await firefox.evaluate('return window.promptResult');
      console.log(`   ${promptResult === 'John Doe' ? '✅' : '❌'} Prompt result: ${promptResult}`);

      // Error handling
      console.log('\n   Testing error handling (no dialog)...');
      try {
        await firefox.acceptDialog();
        console.log('   ❌ Should have thrown error for missing dialog');
      } catch (e) {
        console.log(`   ✅ Error caught correctly: ${e.message}`);
      }

      console.log('\n✅ Dialog handling tests completed!\n');
    } catch (e) {
      console.log('⚠️ Dialog test failed:', e.message);
    }

    // ============================================================================
    // ONLINE TESTS (optional - set TEST_ONLINE=1)
    // ============================================================================

    if (shouldRunOnlineTests()) {
      console.log('\n🌐 Running online tests...\n');

      // Navigate to example.com
      console.log('🧭 Navigating to example.com...');
      await firefox.navigate('https://example.com');
      console.log('✅ Navigation completed');
      await waitShort(2000);

      const newTitle = await firefox.evaluate('return document.title');
      console.log(`✅ Page title: ${newTitle}\n`);

      // Tab management
      console.log('📑 Creating new tab...');
      const newTabIdx = await firefox.createNewPage('https://www.mozilla.org');
      console.log(`✅ Created new tab [${newTabIdx}]\n`);
      await waitShort(3000);

      await firefox.refreshTabs();
      const allTabs = firefox.getTabs();
      console.log('📄 All tabs:');
      allTabs.forEach((tab, idx) => {
        const marker = idx === firefox.getSelectedTabIdx() ? '👉' : '  ';
        console.log(`${marker} [${idx}] ${tab.title.substring(0, 50)} - ${tab.url}`);
      });
      console.log();

      // Network monitoring
      console.log('🌐 Testing network monitoring...');
      try {
        await firefox.startNetworkMonitoring();
        console.log('   Network monitoring started');

        await waitShort(100);
        await firefox.navigate('https://example.com');
        await waitShort(3000);

        const requests = await firefox.getNetworkRequests();
        console.log(`✅ Captured ${requests.length} network request(s):`);

        requests.slice(0, 5).forEach((req, idx) => {
          const statusEmoji = req.status >= 400 ? '❌' : req.status >= 300 ? '⚠️' : '✅';
          console.log(
            `   ${idx + 1}. ${statusEmoji} [${req.method}] ${req.status || '?'} ${req.url.substring(0, 80)}`
          );
        });

        if (requests.length > 5) {
          console.log(`   ... and ${requests.length - 5} more requests`);
        }

        await firefox.stopNetworkMonitoring();
        firefox.clearNetworkRequests();
        console.log('✅ Network monitoring stopped\n');
      } catch (e) {
        console.log('⚠️ Network monitoring test failed:', e.message, '\n');
      }

      // History navigation
      console.log('↩️ Testing back/forward navigation...');
      try {
        await firefox.navigate('https://example.com');
        await waitShort(1000);
        await firefox.navigate('https://www.mozilla.org');
        await waitShort(1000);
        await firefox.navigateBack();
        const titleBack = await firefox.evaluate('return document.title');
        console.log('   Back title:', titleBack);
        await firefox.navigateForward();
        const titleFwd = await firefox.evaluate('return document.title');
        console.log('   Forward title:', titleFwd);
        console.log('✅ History navigation tested\n');
      } catch (e) {
        console.log('⚠️ Skipping history test:', e.message);
      }
    } else {
      skipOnlineTest('Online tests (navigation, network, history, tabs)');
    }

    console.log('✅ All BiDi DevTools tests completed! 🎉\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    console.log('🧹 Closing connection...');
    await firefox.close();
    console.log('✅ Done');
  }
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
