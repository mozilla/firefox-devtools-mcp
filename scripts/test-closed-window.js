#!/usr/bin/env node
/**
 * Test: zombie geckodriver cleanup
 *
 * Two scenarios:
 *
 * Scenario A (SIGSTOP): Firefox is frozen and can't respond, so close() hangs.
 *   Proves that killService() + reset() kills the zombie when close() can't.
 *
 * Scenario B (SIGKILL): Firefox is completely dead (user clicked [X]).
 *   Recovery test: can we clean up and reconnect after Firefox dies?
 *   Note: SIGKILL closes TCP sockets, so geckodriver often dies with Firefox.
 *   A true zombie (geckodriver alive but stuck) is tested by Scenario A.
 */
import { FirefoxDevTools } from '../dist/index.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CLOSE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pgrep(pattern) {
  try {
    return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .map(Number)
      .filter((n) => !isNaN(n));
  } catch {
    return [];
  }
}

function isAlive(pid) {
  // /proc/pid/stat format: pid (comm) state ...
  // The comm field can contain spaces, so we find state after the last ')'.
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const closeParen = stat.lastIndexOf(')');
    const state = stat[closeParen + 2];
    return state !== 'Z';
  } catch {
    return false;
  }
}

function killHard(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

function freeze(pid) {
  try {
    process.kill(pid, 'SIGSTOP');
  } catch {}
}

function getDescendants(parentPid) {
  const result = [];
  const queue = [parentPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    try {
      const output = execFileSync('pgrep', ['-P', String(pid)], {
        encoding: 'utf-8',
      });
      const children = output
        .trim()
        .split('\n')
        .map(Number)
        .filter((n) => !isNaN(n));
      result.push(...children);
      queue.push(...children);
    } catch {
      // No children
    }
  }
  return result;
}

function waitForDeath(pid, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!isAlive(pid)) {
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifyFrozen(pids) {
  for (const pid of pids) {
    if (!isAlive(pid)) continue;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const closeParen = stat.lastIndexOf(')');
      const state = stat[closeParen + 2];
      if (state !== 'T') {
        return { ok: false, pid, state };
      }
    } catch {
      // Process died — that's fine
    }
  }
  return { ok: true };
}

// Suppress unhandled rejections from fire-and-forget promises
process.on('unhandledRejection', () => {});

// ---------------------------------------------------------------------------
// Launch helper — creates FirefoxDevTools, connects, returns instance + PIDs
// ---------------------------------------------------------------------------

async function launchFirefox(geckosBefore, excludePids = []) {
  const devTools = new FirefoxDevTools({
    headless: true,
    viewport: { width: 1280, height: 720 },
  });
  await devTools.connect();

  const geckoPid = pgrep('geckodriver').find(
    (p) => !geckosBefore.has(p) && !excludePids.includes(p)
  );
  if (!geckoPid) {
    throw new Error('No geckodriver PID found after connect');
  }

  const firefoxPids = getDescendants(geckoPid);
  if (firefoxPids.length === 0) {
    killHard(geckoPid);
    throw new Error('No Firefox PIDs found under geckodriver');
  }

  return { devTools, geckoPid, firefoxPids };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

async function main() {
  console.log('--- Zombie geckodriver fix test ---\n');

  const geckosBefore = new Set(pgrep('geckodriver'));

  // ---------------------------------------------------------------
  // Scenario A: Firefox frozen (SIGSTOP)
  // ---------------------------------------------------------------
  console.log('Scenario A: Firefox frozen (SIGSTOP)');

  // Step 1: Launch Firefox
  console.log('  1. Launching Firefox...');
  const a = await launchFirefox(geckosBefore);
  console.log(`     Geckodriver PID: ${a.geckoPid}`);
  console.log(`     Firefox PIDs: ${a.firefoxPids.join(', ')}`);

  // Step 2: Freeze Firefox
  console.log('  2. Freezing Firefox (SIGSTOP)...');
  for (const pid of a.firefoxPids) {
    freeze(pid);
  }
  await sleep(500);
  const frozen = verifyFrozen(a.firefoxPids);
  if (!frozen.ok) {
    console.error(`  [FATAL] Firefox PID ${frozen.pid} not frozen (state=${frozen.state})`);
    for (const pid of a.firefoxPids) killHard(pid);
    killHard(a.geckoPid);
    process.exit(1);
  }
  console.log('     Firefox is frozen');

  // Step 3: Try close() with a timeout — same pattern as production resetFirefox
  console.log(`  3. Calling close() with ${CLOSE_TIMEOUT_MS}ms timeout...`);
  let closeSucceeded = false;
  let timer;
  const closePromise = a.devTools.close().then(
    () => { closeSucceeded = true; },
    () => {}
  );
  const t0 = Date.now();
  try {
    await Promise.race([
      closePromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('close timeout')), CLOSE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // close() didn't finish in time — expected when Firefox is frozen
  } finally {
    clearTimeout(timer);
  }
  const elapsed = Date.now() - t0;

  if (closeSucceeded) {
    console.log(`     close() completed in ${elapsed}ms`);
  } else {
    console.log(`     close() timed out after ~${elapsed}ms as expected`);
    // Verify close() actually hung (not a quick rejection)
    if (elapsed < 3000) {
      console.error('  [FAIL] close() returned too fast — Scenario A did not hang as expected');
      for (const pid of a.firefoxPids) killHard(pid);
      killHard(a.geckoPid);
      process.exit(1);
    }
  }

  // Step 4: Kill the zombie — the actual fix under test
  console.log('  4. Killing zombie geckodriver (killService + reset)...');
  if (typeof a.devTools.killService === 'function') {
    a.devTools.killService();
    a.devTools.reset();
  } else {
    // Without killService, the zombie can't be killed from JS.
    // SIGKILL it manually so we can continue testing.
    console.log('     killService not available — zombie alive (this is the bug)');
    killHard(a.geckoPid);
    const died = await waitForDeath(a.geckoPid, 3000);
    if (!died) {
      console.error('  [FAIL] Could not kill zombie geckodriver even with SIGKILL');
      process.exit(1);
    }
    console.log('  [FAIL] close() hung and killService is not available to kill zombie');
    // Continue to clean up frozen Firefox, then exit
    for (const pid of a.firefoxPids) killHard(pid);
    process.exit(1);
  }

  // Step 5: Clean up frozen Firefox
  console.log('  5. Cleaning up frozen Firefox...');
  for (const pid of a.firefoxPids) {
    killHard(pid);
  }
  await sleep(1000);

  // Step 6: Verify geckodriver is dead
  const geckoDiedA = await waitForDeath(a.geckoPid, 5000);
  if (geckoDiedA) {
    console.log('  6. Geckodriver is dead');
  } else {
    console.log('  [FAIL] Geckodriver still alive after killService + reset');
    killHard(a.geckoPid);
    process.exit(1);
  }

  // Step 7: Reconnect — verify a fresh session works
  console.log('  7. Reconnecting...');
  const a2 = await launchFirefox(geckosBefore, [a.geckoPid]);
  await a2.devTools.navigate('about:blank');
  console.log('     Navigation works');
  await a2.devTools.close();
  console.log('  Scenario A: PASS\n');

  // ---------------------------------------------------------------
  // Scenario B: Firefox killed (SIGKILL) — recovery test
  // ---------------------------------------------------------------
  console.log('Scenario B: Firefox killed (SIGKILL)');

  // Step 1: Launch Firefox
  console.log('  1. Launching Firefox...');
  const b = await launchFirefox(geckosBefore, [a.geckoPid, a2.geckoPid]);
  console.log(`     Geckodriver PID: ${b.geckoPid}`);
  console.log(`     Firefox PIDs: ${b.firefoxPids.join(', ')}`);

  // Step 2: Kill Firefox (simulates user clicking [X])
  console.log('  2. Killing Firefox...');
  for (const pid of b.firefoxPids) {
    killHard(pid);
  }
  for (const pid of b.firefoxPids) {
    const died = await waitForDeath(pid, 5000);
    if (!died) {
      console.error(`  [FATAL] Firefox PID ${pid} did not die after SIGKILL`);
      killHard(b.geckoPid);
      process.exit(1);
    }
  }
  console.log('     Firefox is dead');

  // Step 3: Check for zombie geckodriver
  if (isAlive(b.geckoPid)) {
    console.log('  3. Zombie geckodriver detected');
  } else {
    console.log('  3. Geckodriver died with Firefox (no zombie)');
  }

  // Step 4: Run cleanup — close with timeout, then killService + reset fallback
  console.log('  4. Running cleanup (close with timeout, killService fallback)...');
  let closeOk = false;
  let timerB;
  const closeB = b.devTools.close().then(
    () => { closeOk = true; },
    () => {}
  );
  try {
    await Promise.race([
      closeB,
      new Promise((_, reject) => {
        timerB = setTimeout(() => reject(new Error('close timeout')), CLOSE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // close() didn't finish in time
  } finally {
    clearTimeout(timerB);
  }
  if (!closeOk) {
    if (typeof b.devTools.killService === 'function') {
      b.devTools.killService();
      b.devTools.reset();
    } else {
      console.log('     killService not available — killing zombie directly');
      killHard(b.geckoPid);
      await waitForDeath(b.geckoPid, 3000);
      console.log('  [FAIL] killService is not available to kill zombie');
      process.exit(1);
    }
  }

  // Step 5: Verify geckodriver is dead
  const geckoDiedB = await waitForDeath(b.geckoPid, 5000);
  if (geckoDiedB) {
    console.log('  5. Geckodriver is dead');
  } else {
    console.log('  [FAIL] Geckodriver still alive after cleanup');
    killHard(b.geckoPid);
    process.exit(1);
  }

  // Step 6: Reconnect — verify a fresh session works
  console.log('  6. Reconnecting...');
  const b2 = await launchFirefox(geckosBefore, [a.geckoPid, a2.geckoPid, b.geckoPid]);
  await b2.devTools.navigate('about:blank');
  console.log('     Navigation works');
  await b2.devTools.close();
  console.log('  Scenario B: PASS\n');

  // Final cleanup
  const leftover = pgrep('geckodriver').filter((p) => !geckosBefore.has(p));
  for (const pid of leftover) {
    killHard(pid);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
