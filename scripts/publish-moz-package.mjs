#!/usr/bin/env node
/**
 * Builds and publishes the firefox-mcp-moz package.
 * Creates a staging directory with dist.moz/ and package.moz.json as package.json,
 * then runs npm publish from there.
 *
 * Any extra arguments are forwarded to npm publish, e.g.:
 *   node publish-moz-package.mjs --access public --provenance
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { publishStaged, root } from './_helpers/publish-staged.mjs';

console.log('Building moz package...');
execSync('npm run build:moz', { cwd: root, stdio: 'inherit' });

publishStaged({
  pkg: JSON.parse(readFileSync(resolve(root, 'package.moz.json'), 'utf8')),
  stagingPrefix: 'firefox-mcp-moz-',
  npmArgs: process.argv.slice(2),
});
