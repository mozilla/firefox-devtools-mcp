/**
 * Publishes a package built from this repository under its own package.json.
 * Copies the entries of `pkg.files` from the repository root into a temporary
 * folder, writes `pkg` there as package.json, then runs npm publish from there.
 */

import { existsSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function isPublished({ name, version }) {
  try {
    const output = execSync(`npm view ${name}@${version} version --prefer-online`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.toString().trim() === version;
  } catch {
    return false;
  }
}

/**
 * Does nothing when this version is already on npm, so that a publish job can
 * be rerun after it stopped halfway.
 *
 * @param {object} options
 * @param {object} options.pkg content of the published package.json
 * @param {string} options.stagingPrefix prefix of the temporary folder name
 * @param {string[]} options.npmArgs extra arguments forwarded to npm publish
 * @param {(stagingDir: string) => void} [options.prepare] adjusts the staged files before publishing
 */
export function publishStaged({ pkg, stagingPrefix, npmArgs, prepare }) {
  if (isPublished(pkg)) {
    console.log(`${pkg.name}@${pkg.version} is already published, skipping.`);
    return;
  }

  const stagingDir = mkdtempSync(resolve(tmpdir(), stagingPrefix));

  try {
    for (const entry of pkg.files) {
      const src = resolve(root, entry);
      const dst = resolve(stagingDir, entry);
      if (!existsSync(src)) {
        console.warn(`Warning: ${entry} not found, skipping`);
        continue;
      }
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst, { recursive: true });
    }

    writeFileSync(resolve(stagingDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    prepare?.(stagingDir);

    console.log(`Publishing ${pkg.name}@${pkg.version}...`);
    execSync(`npm publish ${npmArgs.join(' ')}`, { cwd: stagingDir, stdio: 'inherit' });
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
