// Vitest setup file
// This file runs before all tests

import { afterAll } from 'vitest';
import { execSync } from 'child_process';

afterAll(() => {
  // Global cleanup: kill any remaining Firefox/geckodriver processes
  cleanup();
});

/**
 * Cleanup function to kill all Firefox and geckodriver processes
 * This ensures no zombie processes are left after test runs
 */
function cleanup() {
  try {
    // Find Firefox processes started with --marionette (test instances)
    const firefoxPids = execSync('pgrep -f "firefox.*marionette" || true', {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Kill children of each Firefox test process, then kill the parent
    for (const pid of firefoxPids) {
      try {
        execSync(`pkill -9 -P ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
      } catch {
        // Ignore errors - child processes might already be dead
      }
      try {
        execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
      } catch {
        // Ignore errors - process might already be dead
      }
    }

    // Kill all geckodriver processes
    execSync('pkill -9 -f geckodriver || true', {
      stdio: 'ignore',
    });

    console.log('✅ Global cleanup: All test Firefox processes terminated');
  } catch (error) {
    // Ignore errors - processes might already be dead
  }
}
