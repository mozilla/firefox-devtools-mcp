#!/usr/bin/env node
/**
 * Syncs every file that duplicates the package.json version.
 * Run it from the release-prep commit via `npm run sync:manifests`. It also
 * runs from the `version` npm lifecycle script for anyone using `npm version`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
);

const setVersion = (doc) => ({ ...doc, version });

/** Each entry maps a file to the update it needs, since several carry the version more than once. */
const targets = [
  ['.cursor-plugin/plugin.json', setVersion],
  ['gemini-extension.json', setVersion],
  ['manifest.mcpb.json', setVersion],
  [
    'server.json',
    (doc) => ({
      ...doc,
      version,
      packages: doc.packages.map((pkg) => ({ ...pkg, version })),
    }),
  ],
  [
    'package-lock.json',
    (doc) => ({
      ...doc,
      version,
      packages: { ...doc.packages, '': { ...doc.packages[''], version } },
    }),
  ],
];

for (const [relativePath, update] of targets) {
  const path = resolve(root, relativePath);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify(update(doc), null, 2) + '\n');
  console.log(`Synced ${relativePath} to ${version}`);
}
