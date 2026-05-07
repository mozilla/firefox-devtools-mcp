#!/usr/bin/env node
/**
 * Generates package.moz.json from package.json by applying the overrides
 * needed for the @mozilla/firefox-devtools-mcp-moz npm package.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const moz = {
  ...pkg,
  name: '@mozilla/firefox-devtools-mcp-moz',
  description:
    pkg.description + ' (moz build with privileged context support)',
  main: 'dist.moz/index.js',
  types: 'dist.moz/index.d.ts',
  bin: {
    'firefox-devtools-mcp-moz': './dist.moz/index.js',
  },
  files: ['dist.moz', 'README.md', 'LICENSE', 'scripts', 'plugins'],
  publishConfig: {
    access: 'public',
  },
};

// Remove scripts that don't apply to the moz package
delete moz.scripts;

const outPath = resolve(root, 'package.moz.json');
writeFileSync(outPath, JSON.stringify(moz, null, 2) + '\n');
console.log(`Written ${outPath}`);
