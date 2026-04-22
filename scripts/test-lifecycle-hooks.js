/**
 * Test lifecycle hooks and automatic cleanup on navigation
 */
import { FirefoxDevTools } from '../dist/index.js';

async function testLifecycleHooks() {
  console.log('🧪 Testing lifecycle hooks...\n');

  const client = new FirefoxDevTools({
    headless: true,
    firefoxPath: process.env.FIREFOX_PATH,
    args: ['--width=1280', '--height=720'],
  });

  try {
    await client.connect();
    console.log('✅ Connected to Firefox\n');

    // Navigate to example.com
    console.log('📄 Navigating to example.com...');
    await client.navigate('https://example.com');
    console.log('✅ Page loaded\n');

    // Take snapshot and get a UID
    console.log('📸 Taking snapshot...');
    const snapshot1 = await client.takeSnapshot();
    const uid1 = snapshot1.json.root.uid;
    console.log(`✅ Snapshot 1 taken, root UID: ${uid1}\n`);

    // Verify UID works
    console.log('🧪 Testing UID resolution before navigation...');
    const selector1 = client.resolveUidToSelector(uid1);
    console.log(`✅ UID ${uid1} resolves to: ${selector1}\n`);

    // Start network monitoring
    console.log('🌐 Starting network monitoring...');
    await client.startNetworkMonitoring();
    console.log('✅ Network monitoring started\n');

    // Make some network requests by navigating
    console.log('📄 Navigating to mozilla.org (triggers lifecycle hooks)...');
    await client.navigate('https://www.mozilla.org');
    console.log('✅ Navigation completed\n');

    // Wait a bit for network requests
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check network requests (should have some from mozilla.org)
    const requests1 = await client.getNetworkRequests();
    console.log(`📊 Network requests captured: ${requests1.length}`);
    if (requests1.length > 0) {
      console.log(`   First request: ${requests1[0].method} ${requests1[0].url}\n`);
    }

    // Test staleness: old UID should fail
    console.log('🧪 Testing staleness detection (old UID should fail)...');
    try {
      client.resolveUidToSelector(uid1);
      console.log('❌ FAIL: Old UID should have been invalidated!\n');
    } catch (err) {
      console.log(`✅ PASS: Old UID correctly rejected: ${err.message}\n`);
    }

    // Take new snapshot
    console.log('📸 Taking new snapshot...');
    const snapshot2 = await client.takeSnapshot();
    const uid2 = snapshot2.json.root.uid;
    console.log(`✅ Snapshot 2 taken, root UID: ${uid2}\n`);

    // Navigate again
    console.log('📄 Navigating to example.com again (triggers lifecycle hooks)...');
    await client.navigate('https://example.com');
    console.log('✅ Navigation completed\n');

    // Wait for page to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check network requests after navigation (should be cleared automatically)
    const requests2 = await client.getNetworkRequests();
    console.log(`📊 Network requests after 2nd navigation: ${requests2.length}`);
    console.log(
      requests2.length === 0
        ? '✅ PASS: Network requests auto-cleared on navigation\n'
        : '⚠️  WARN: Network requests not cleared (check lifecycle hook)\n'
    );

    // Test console messages
    console.log('📝 Checking console messages...');
    const consoleMessages1 = await client.getConsoleMessages();
    console.log(`   Console messages: ${consoleMessages1.length}\n`);

    // Trigger console message
    await client.evaluate(`console.log('Test message from lifecycle hook test')`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const consoleMessages2 = await client.getConsoleMessages();
    console.log(`   Console messages after log: ${consoleMessages2.length}`);
    console.log(
      `   Last message: ${consoleMessages2[consoleMessages2.length - 1]?.text || 'none'}\n`
    );

    // Navigate again and check if console was cleared
    console.log('📄 Navigating one more time to check console clearing...');
    await client.navigate('https://example.com');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const consoleMessages3 = await client.getConsoleMessages();
    console.log(`📊 Console messages after 3rd navigation: ${consoleMessages3.length}`);
    console.log(
      consoleMessages3.length === 0
        ? '✅ PASS: Console auto-cleared on navigation\n'
        : '⚠️  INFO: Console has messages (from new page)\n'
    );

    console.log('✅ All lifecycle hook tests completed! 🎉\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('🧹 Closing connection...');
    await client.close();
    console.log('✅ Done');
  }
}

testLifecycleHooks();
