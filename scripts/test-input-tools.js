#!/usr/bin/env node

/**
 * Test script for UID-based input tools (Task 21)
 * Tests: clickByUid, fillByUid, hoverByUid, dragByUidToUid, fillFormByUid, uploadFileByUid
 *
 * Note: Uses innerHTML injection to avoid Firefox data: URL parsing issues
 */

import { FirefoxDevTools } from '../dist/index.js';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHTML, waitShort } from './_helpers/page-loader.js';

async function main() {
  console.log('🧪 Testing UID-based input tools...\n');

  const firefox = new FirefoxDevTools({
    firefoxPath: process.env.FIREFOX_PATH,
    headless: false,
    startUrl: 'about:blank',
  });

  try {
    console.log('📡 Connecting to Firefox...');
    await firefox.connect();
    console.log('✅ Connected!\n');

    // Test 1: Click
    console.log('🖱️  Test 1: Click By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <button id="btn">Click Me</button>
        <script>
          document.getElementById('btn').addEventListener('click', () => {
            document.body.setAttribute('data-result', 'clicked');
          });
        </script>
      </body>
    `);
    let snapshot = await firefox.takeSnapshot();
    const btnUid = snapshot.json.root.children.find(n => n.tag === 'button')?.uid;
    if (btnUid) {
      await firefox.clickByUid(btnUid);
      await waitShort();
      const result = await firefox.evaluate("return document.body.getAttribute('data-result')");
      console.log(`   ${result === 'clicked' ? '✅' : '❌'} Click: ${result}\n`);
    } else {
      console.log('   ❌ Button UID not found\n');
    }

    // Test 2: Fill
    console.log('✍️  Test 2: Fill By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <input id="inp" type="text">
        <script>
          document.getElementById('inp').addEventListener('input', (e) => {
            document.body.setAttribute('data-value', e.target.value);
          });
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const inpUid = snapshot.json.root.children.find(n => n.tag === 'input')?.uid;
    if (inpUid) {
      await firefox.fillByUid(inpUid, 'Hello Test');
      await waitShort();
      const value = await firefox.evaluate("return document.body.getAttribute('data-value')");
      console.log(`   ${value === 'Hello Test' ? '✅' : '❌'} Fill: ${value}\n`);
    } else {
      console.log('   ❌ Input UID not found\n');
    }

    // Test 3: Hover
    console.log('🎯 Test 3: Hover By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <div id="hover">Hover Me</div>
        <script>
          document.getElementById('hover').addEventListener('mouseenter', () => {
            document.body.setAttribute('data-hovered', '1');
          });
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const hoverUid = snapshot.json.root.children.find(n => n.tag === 'div')?.uid;
    if (hoverUid) {
      await firefox.hoverByUid(hoverUid);
      await waitShort();
      const hovered = await firefox.evaluate("return document.body.getAttribute('data-hovered')");
      console.log(`   ${hovered === '1' ? '✅' : '❌'} Hover: ${hovered}\n`);
    } else {
      console.log('   ❌ Div UID not found\n');
    }

    // Test 4: Fill Form
    console.log('📝 Test 4: Fill Form By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <input id="first" type="text" name="firstName">
        <input id="last" type="text" name="lastName">
        <script>
          let values = {};
          ['first', 'last'].forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => {
              values[id] = e.target.value;
              if (Object.keys(values).length === 2) {
                document.body.setAttribute('data-form', JSON.stringify(values));
              }
            });
          });
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const inputs = snapshot.json.root.children.filter(n => n.tag === 'input');
    if (inputs.length === 2) {
      await firefox.fillFormByUid([
        { uid: inputs[0].uid, value: 'John' },
        { uid: inputs[1].uid, value: 'Doe' },
      ]);
      await waitShort(500);
      const formData = await firefox.evaluate("return document.body.getAttribute('data-form')");
      const parsed = JSON.parse(formData || '{}');
      const ok = parsed.first === 'John' && parsed.last === 'Doe';
      console.log(`   ${ok ? '✅' : '❌'} Fill Form: ${formData}\n`);
    } else {
      console.log(`   ❌ Expected 2 inputs, found ${inputs.length}\n`);
    }

    // Test 5: Upload File
    console.log('📁 Test 5: Upload File By UID');
    const tmpDir = await mkdtemp(join(tmpdir(), 'test-'));
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'test content');

    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <input id="file" type="file" style="display:none">
        <script>
          document.getElementById('file').addEventListener('change', (e) => {
            if (e.target.files[0]) {
              document.body.setAttribute('data-filename', e.target.files[0].name);
            }
          });
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const fileUid = snapshot.json.root.children.find(n => n.tag === 'input')?.uid;
    if (fileUid) {
      await firefox.uploadFileByUid(fileUid, filePath);
      await waitShort();
      const filename = await firefox.evaluate("return document.body.getAttribute('data-filename')");
      console.log(`   ${filename === 'test.txt' ? '✅' : '❌'} Upload: ${filename}\n`);
    } else {
      console.log('   ❌ File input UID not found\n');
    }
    await rm(tmpDir, { recursive: true, force: true });

    // Test 6: Drag & Drop
    console.log('🧲 Test 6: Drag & Drop By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <div id="drag" draggable="true">Drag</div>
        <div id="drop">Drop</div>
        <script>
          const drop = document.getElementById('drop');
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            document.body.setAttribute('data-dropped', '1');
          });
          drop.addEventListener('dragover', (e) => e.preventDefault());
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const divs = snapshot.json.root.children.filter(n => n.tag === 'div');
    if (divs.length === 2) {
      await firefox.dragByUidToUid(divs[0].uid, divs[1].uid);
      await waitShort();
      const dropped = await firefox.evaluate("return document.body.getAttribute('data-dropped')");
      console.log(`   ${dropped === '1' ? '✅' : '❌'} Drag & Drop: ${dropped}\n`);
    } else {
      console.log(`   ❌ Expected 2 divs, found ${divs.length}\n`);
    }

    // Test 7: Double Click
    console.log('🖱️🖱️  Test 7: Double Click By UID');
    await loadHTML(firefox, `
      <head><title>Test</title></head>
      <body>
        <button id="dblBtn">Double Click</button>
        <script>
          document.getElementById('dblBtn').addEventListener('dblclick', () => {
            document.body.setAttribute('data-dblclick', '1');
          });
        </script>
      </body>
    `);
    snapshot = await firefox.takeSnapshot();
    const dblBtnUid = snapshot.json.root.children.find(n => n.tag === 'button')?.uid;
    if (dblBtnUid) {
      await firefox.clickByUid(dblBtnUid, true);
      await waitShort();
      const dblClicked = await firefox.evaluate("return document.body.getAttribute('data-dblclick')");
      console.log(`   ${dblClicked === '1' ? '✅' : '❌'} Double Click: ${dblClicked}\n`);
    } else {
      console.log('   ❌ Button UID not found\n');
    }

    console.log('✅ All tests completed! 🎉\n');
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
