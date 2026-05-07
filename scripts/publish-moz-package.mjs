#!/usr/bin/env node
/**
 * Builds and publishes the firefox-devtools-mcp-moz package.
 * Creates a staging directory with dist.moz/ and package.moz.json as package.json,
 * then runs npm publish from there.
 *
 * Any extra arguments are forwarded to npm publish, e.g.:
 *   node publish-moz-package.mjs --access public --provenance
 */

import { readFileSync, existsSync, cpSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('Building moz package...');
execSync('npm run build:moz', { cwd: root, stdio: 'inherit' });

const mozPkg = JSON.parse(readFileSync(resolve(root, 'package.moz.json'), 'utf8'));
const stagingDir = mkdtempSync(resolve(tmpdir(), 'firefox-devtools-mcp-moz-'));

try {
  for (const entry of mozPkg.files) {
    const src = resolve(root, entry);
    const dst = resolve(stagingDir, entry);
    if (!existsSync(src)) {
      console.warn(`Warning: ${entry} not found, skipping`);
      continue;
    }
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
  }

  copyFileSync(resolve(root, 'package.moz.json'), resolve(stagingDir, 'package.json'));

  const extraArgs = process.argv.slice(2).join(' ');
  console.log(`Publishing ${mozPkg.name}@${mozPkg.version}...`);
  execSync(`npm publish ${extraArgs}`, { cwd: stagingDir, stdio: 'inherit' });
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
