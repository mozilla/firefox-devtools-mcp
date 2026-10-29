/**
 * Helper for saving bulky tool output to disk instead of returning it inline.
 */

import { mkdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { homeRoot, legacyHomeRoot, outputDir } from './paths.js';
import { isFirefoxProfile } from '../firefox/profile.js';

export interface SavedOutput {
  path: string;
  bytes: number;
}

function generatedName(baseName: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${baseName}-${timestamp}.${extension}`;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Whether `candidate` is `root` or sits inside it. Compared case-insensitively
 * on Windows, where `c:\Users\...` and `C:\Users\...` are the same directory —
 * matching case exactly would reject valid paths, not catch escapes.
 */
export function isWithinRoot(root: string, candidate: string): boolean {
  const normalize = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const normalizedRoot = normalize(root);
  const normalizedCandidate = normalize(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/**
 * Absolute path with symlinks resolved as far as the path exists, keeping the
 * segments that do not exist yet. A plain realpath() would throw on the file we
 * are about to create, and a purely lexical compare would let a symlinked
 * directory point out of an allowed root.
 */
async function realpathThroughMissing(target: string): Promise<string> {
  let current = resolve(target);
  const missing: string[] = [];

  for (;;) {
    try {
      return join(await realpath(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return join(current, ...missing);
      }
      missing.unshift(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

/**
 * Reject saveTo paths that escape the allowed roots, or that reach data Firefox
 * and this server read back: the profiles, the instance port files and the
 * captured Firefox output. Skipped entirely with --unrestricted-save-paths.
 * @param label the name of the tool argument the path came from, used in the error message
 */
export async function assertAllowedPath(
  inputPath: string,
  resolvedPath: string,
  label = 'saveTo'
): Promise<void> {
  const { args } = await import('../index.js');
  if (args?.unrestrictedSavePaths) {
    return;
  }

  const refusal = (reason: string) =>
    new Error(
      `${label} "${inputPath}" ${reason} (${resolvedPath}). Relative paths must stay within ` +
        `the current working directory and absolute paths within ${outputDir()}, and neither ` +
        `may reach the profiles, instance port files or captured output this server reads ` +
        `back. Start the server with --unrestricted-save-paths to write to arbitrary ` +
        `locations.`
    );

  const candidate = await realpathThroughMissing(resolvedPath);
  const output = await realpathThroughMissing(outputDir());
  const root = isAbsolute(inputPath) ? output : await realpathThroughMissing(process.cwd());
  if (!isWithinRoot(root, candidate)) {
    throw refusal('resolves outside the allowed location');
  }

  // The whole data directory, save for the output subtree inside it. The legacy
  // one too, as it still holds the instance port files Firefox writes.
  for (const dataRoot of [homeRoot(), legacyHomeRoot()]) {
    const home = await realpathThroughMissing(dataRoot);
    if (isWithinRoot(home, candidate) && !isWithinRoot(output, candidate)) {
      throw refusal(`resolves inside ${dataRoot}, which this server reads back`);
    }
  }

  // Locations the operator pointed elsewhere; by path, as they may not exist yet.
  const profile = args?.profilePath && resolve(args.profilePath);
  if (profile && isWithinRoot(await realpathThroughMissing(profile), candidate)) {
    throw refusal(`resolves inside ${profile}, which this server reads back`);
  }

  const outputFile = args?.outputFile && resolve(args.outputFile);
  if (outputFile && isWithinRoot(await realpathThroughMissing(outputFile), candidate)) {
    throw refusal(`resolves inside ${outputFile}, which this server reads back`);
  }

  // Any profile Firefox has used, including ones this server knows nothing about.
  const parent = dirname(candidate);
  if (isFirefoxProfile(parent)) {
    throw refusal(`resolves inside the Firefox profile ${parent}`);
  }
}

/**
 * Write content to saveTo: a file path (relative to the current working
 * directory, or absolute within ~/.firefox-mcp/output; parent
 * directories are created as needed), or an existing directory (a generated file
 * named after baseName is placed inside). When saveTo is empty, the generated
 * file goes to ~/.firefox-mcp/output/. Paths escaping the allowed roots
 * are rejected unless the server runs with --unrestricted-save-paths.
 */
export async function saveOutput(
  content: string | Buffer,
  saveTo: string | undefined,
  baseName: string,
  extension = 'json'
): Promise<SavedOutput> {
  let resolvedPath: string;
  if (saveTo) {
    resolvedPath = resolve(saveTo);
    if (await isDirectory(resolvedPath)) {
      resolvedPath = join(resolvedPath, generatedName(baseName, extension));
    }
    await assertAllowedPath(saveTo, resolvedPath);
  } else {
    resolvedPath = join(outputDir(), generatedName(baseName, extension));
  }
  await mkdir(dirname(resolvedPath), { recursive: true });

  // Write via a sibling temp file and rename so a failed write never leaves a partial file.
  const tmpPath = `${resolvedPath}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tmpPath, content);
    await rename(tmpPath, resolvedPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }

  return { path: resolvedPath, bytes: Buffer.byteLength(content) };
}
