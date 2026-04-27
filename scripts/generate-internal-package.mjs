#!/usr/bin/env node
/**
 * Generates package.internal.json from package.json by applying the overrides
 * needed for the firefox-devtools-mcp-internal npm package.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const internal = {
  ...pkg,
  name: 'firefox-devtools-mcp-internal',
  description:
    pkg.description + ' (internal build with privileged context support)',
  main: 'dist.internal/index.js',
  types: 'dist.internal/index.d.ts',
  bin: {
    'firefox-devtools-mcp-internal': './dist.internal/index.js',
  },
  files: ['dist.internal', 'README.md', 'LICENSE', 'scripts', 'plugins'],
  publishConfig: {
    access: 'restricted',
  },
};

// Remove scripts that don't apply to the internal package
delete internal.scripts;

const outPath = resolve(root, 'package.internal.json');
writeFileSync(outPath, JSON.stringify(internal, null, 2) + '\n');
console.log(`Written ${outPath}`);
