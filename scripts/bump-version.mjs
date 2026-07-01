#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  console.error('Example: node scripts/bump-version.mjs 0.9.8');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function updateJson(filePath, update) {
  const obj = JSON.parse(readFileSync(filePath, 'utf8'));
  const prev = obj.version;
  update(obj);
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
  console.log(`${filePath}: ${prev} -> ${obj.version}`);
}

updateJson(resolve(root, 'package.json'), pkg => {
  pkg.version = version;
});

updateJson(
  resolve(root, 'plugins/claude/firefox-devtools/.claude-plugin/plugin.json'),
  plugin => {
    plugin.version = version;
  }
);
