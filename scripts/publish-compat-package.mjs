#!/usr/bin/env node
/**
 * Publishes the current dist/ build as @mozilla/firefox-devtools-mcp, the
 * package name used before the rename to firefox-mcp, so that existing
 * `npx @mozilla/firefox-devtools-mcp@latest` setups keep updating.
 * Run it after the main package is built.
 *
 * Any extra arguments are forwarded to npm publish, e.g.:
 *   node publish-compat-package.mjs --access public --provenance
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publishStaged, root } from './_helpers/publish-staged.mjs';

if (!existsSync(resolve(root, 'dist', 'index.js'))) {
  console.error('dist/index.js not found, run npm run build first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const compat = { ...pkg, name: '@mozilla/firefox-devtools-mcp' };

// prepublishOnly would rebuild inside the staging directory
delete compat.scripts;

// mcpName claims the MCP registry entry of the canonical package, not this one
delete compat.mcpName;

publishStaged({
  pkg: compat,
  stagingPrefix: 'firefox-devtools-mcp-compat-',
  npmArgs: process.argv.slice(2),
  prepare: (stagingDir) => {
    const readme = resolve(stagingDir, 'README.md');
    const notice =
      `**This package is now published as [\`${pkg.name}\`](https://www.npmjs.com/package/${pkg.name}).** ` +
      `\`${compat.name}\` gets the same releases, so existing setups keep working.\n\n`;
    writeFileSync(readme, notice + readFileSync(readme, 'utf8'));
  },
});
