/**
 * Unit tests for save-output helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { basename, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

const MOCK_HOME = join(tmpdir(), 'save-output-test-home');
const HOME_ROOT = join(MOCK_HOME, '.firefox-devtools-mcp');
const OUTPUT_ROOT = join(HOME_ROOT, 'output');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

const mockArgs = vi.hoisted(() => ({
  unrestrictedSavePaths: false,
  profilePath: undefined as string | undefined,
  outputFile: undefined as string | undefined,
}));
vi.mock('../../../src/index.js', () => ({ args: mockArgs }));

import { saveOutput, isWithinRoot } from '../../../src/utils/save-output.js';

describe('saveOutput', () => {
  const tempDir = join(tmpdir(), `save-output-test-${process.pid}`);
  const cwdDir = join(process.cwd(), `save-output-cwd-${process.pid}`);

  beforeEach(() => {
    mockArgs.unrestrictedSavePaths = false;
    mockArgs.profilePath = undefined;
    mockArgs.outputFile = undefined;
  });

  afterEach(() => {
    for (const dir of [tempDir, MOCK_HOME, cwdDir]) {
      if (existsSync(dir)) {
        removeDir(dir);
      }
    }
  });

  describe('write behavior (unrestricted)', () => {
    beforeEach(() => {
      mockArgs.unrestrictedSavePaths = true;
    });

    it('should write to an absolute path and report bytes', async () => {
      const filePath = join(tempDir, 'result.json');
      const saved = await saveOutput('{"a":1}', filePath, 'evaluate-script');

      expect(saved.path).toBe(filePath);
      expect(saved.bytes).toBe(7);
      expect(readFileSync(filePath, 'utf8')).toBe('{"a":1}');
    });

    it('should create missing parent directories', async () => {
      const filePath = join(tempDir, 'nested', 'deep', 'result.json');
      const saved = await saveOutput('data', filePath, 'evaluate-script');

      expect(saved.path).toBe(filePath);
      expect(existsSync(filePath)).toBe(true);
    });

    it('should not leave temporary files behind', async () => {
      const filePath = join(tempDir, 'result.json');
      await saveOutput('data', filePath, 'evaluate-script');

      expect(readdirSync(tempDir)).toEqual(['result.json']);
    });

    it('should write Buffer content verbatim and report its byte length', async () => {
      const filePath = join(tempDir, 'image.png');
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
      const saved = await saveOutput(buffer, filePath, 'screenshot', 'png');

      expect(saved.path).toBe(filePath);
      expect(saved.bytes).toBe(buffer.length);
      expect(readFileSync(filePath)).toEqual(buffer);
    });

    it('should place a generated file inside saveTo when it is an existing directory', async () => {
      mkdirSync(tempDir, { recursive: true });
      const saved = await saveOutput('{"a":1}', tempDir, 'network-requests', 'json');

      expect(saved.path.startsWith(tempDir + sep)).toBe(true);
      expect(basename(saved.path)).toMatch(/^network-requests-.*\.json$/);
      expect(existsSync(saved.path)).toBe(true);
    });
  });

  describe('path restriction (default)', () => {
    it('should allow a relative path within the current working directory', async () => {
      const filePath = join(cwdDir, 'result.json');
      const relativePath = relative(process.cwd(), filePath);
      const saved = await saveOutput('data', relativePath, 'evaluate-script');

      expect(saved.path).toBe(filePath);
      expect(existsSync(filePath)).toBe(true);
    });

    it('should reject a relative path that escapes the current working directory', async () => {
      const escaping = join('..', `save-output-escape-${process.pid}.json`);
      await expect(saveOutput('data', escaping, 'evaluate-script')).rejects.toThrow(
        '--unrestricted-save-paths'
      );
    });

    it('should allow an absolute path within the output directory', async () => {
      const filePath = join(OUTPUT_ROOT, 'sub', 'result.json');
      const saved = await saveOutput('data', filePath, 'evaluate-script');

      expect(saved.path).toBe(filePath);
      expect(existsSync(filePath)).toBe(true);
    });

    it('should reject an absolute path outside the output directory', async () => {
      const filePath = join(tempDir, 'result.json');
      await expect(saveOutput('data', filePath, 'evaluate-script')).rejects.toThrow(
        '--unrestricted-save-paths'
      );
      expect(existsSync(filePath)).toBe(false);
    });

    it('should reject the directories the server reads back', async () => {
      // A profile user.js applies at the next startup and survives the server,
      // the port files decide which Firefox we attach to, and the captured
      // output is returned by get_firefox_output.
      const targets = [
        join(HOME_ROOT, 'profile', 'firefox_devtools_mcp_profile', 'user.js'),
        join(HOME_ROOT, 'instances', '1234.port'),
        join(HOME_ROOT, 'logs', 'firefox-forged.log'),
      ];

      for (const filePath of targets) {
        await expect(saveOutput('data', filePath, 'get-page-text', 'txt')).rejects.toThrow(
          '--unrestricted-save-paths'
        );
        expect(existsSync(filePath)).toBe(false);
      }
    });

    it('should reject an absolute path in the home root but outside output', async () => {
      const filePath = join(HOME_ROOT, 'result.json');
      await expect(saveOutput('data', filePath, 'evaluate-script')).rejects.toThrow(
        '--unrestricted-save-paths'
      );
      expect(existsSync(filePath)).toBe(false);
    });

    it('should reject a relative path into a profile passed on the command line', async () => {
      // The working directory stays writable, so a profile inside it is only
      // protected by knowing where it is.
      mockArgs.profilePath = relative(process.cwd(), join(cwdDir, 'ff-profile'));
      const target = join(mockArgs.profilePath, 'firefox_devtools_mcp_profile', 'user.js');

      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        'reads back'
      );
      expect(existsSync(join(process.cwd(), target))).toBe(false);
    });

    it('should reject a relative path into a marked profile passed directly', async () => {
      const profile = join(cwdDir, 'marked-profile');
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(profile, '.firefox-devtools-mcp'), '');
      mockArgs.profilePath = profile;
      const target = relative(process.cwd(), join(profile, 'user.js'));

      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        'reads back'
      );
      expect(existsSync(join(profile, 'user.js'))).toBe(false);
    });

    it('should reject a directory that looks like a Firefox profile', async () => {
      // No configuration points here: recognised by its contents, which covers
      // a profile reached with --connect-existing or named at runtime.
      const profile = join(cwdDir, 'some-profile');
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(profile, 'places.sqlite'), '');
      const target = relative(process.cwd(), join(profile, 'user.js'));

      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        'Firefox profile'
      );
      expect(existsSync(join(profile, 'user.js'))).toBe(false);
    });

    it('should reject paths inside an unmarked profile path', async () => {
      const parent = join(cwdDir, 'plain-parent');
      mkdirSync(parent, { recursive: true });
      mockArgs.profilePath = parent;
      const target = relative(process.cwd(), join(parent, 'notes.txt'));

      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        'reads back'
      );
      expect(existsSync(join(parent, 'notes.txt'))).toBe(false);
    });

    it('should reject the file passed to --output-file', async () => {
      mockArgs.outputFile = join(cwdDir, 'firefox.log');
      const target = relative(process.cwd(), mockArgs.outputFile);

      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        'reads back'
      );
    });

    it('should not be fooled by a symlink out of the allowed root', async () => {
      const profile = join(HOME_ROOT, 'profile', 'firefox_devtools_mcp_profile');
      mkdirSync(profile, { recursive: true });
      mkdirSync(cwdDir, { recursive: true });
      const link = join(cwdDir, 'link-to-profile');
      symlinkSync(profile, link);
      const target = join(relative(process.cwd(), link), 'user.js');

      // Lexically the path sits under the working directory; resolved, it lands
      // in the profile.
      await expect(saveOutput('data', target, 'get-page-text', 'txt')).rejects.toThrow(
        /outside the allowed location|reads back/
      );
      expect(existsSync(join(profile, 'user.js'))).toBe(false);
    });

    it('should allow an ordinary relative path while a profile is configured', async () => {
      mockArgs.profilePath = join(cwdDir, 'ff-profile');
      const target = relative(process.cwd(), join(cwdDir, 'snapshot.txt'));

      const saved = await saveOutput('data', target, 'take-snapshot', 'txt');
      expect(existsSync(saved.path)).toBe(true);
    });

    it('should generate a timestamped file in the default output dir when no path is given', async () => {
      const saved = await saveOutput('data', undefined, 'evaluate-script');

      expect(saved.path.startsWith(OUTPUT_ROOT + sep)).toBe(true);
      expect(saved.path).toContain('evaluate-script-');
      expect(saved.path.endsWith('.json')).toBe(true);
      expect(readFileSync(saved.path, 'utf8')).toBe('data');
    });

    it('should use the custom extension in the generated file name', async () => {
      const saved = await saveOutput('tree', undefined, 'snapshot', 'txt');

      expect(saved.path).toContain('snapshot-');
      expect(saved.path.endsWith('.txt')).toBe(true);
    });
  });
});

describe('isWithinRoot', () => {
  const originalPlatform = process.platform;
  const root = join('C:', 'Users', 'me', '.firefox-devtools-mcp');

  const setPlatform = (platform: NodeJS.Platform) =>
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });

  afterEach(() => setPlatform(originalPlatform));

  it('accepts the root itself and paths inside it', () => {
    expect(isWithinRoot(root, root)).toBe(true);
    expect(isWithinRoot(root, join(root, 'out.json'))).toBe(true);
    expect(isWithinRoot(root, join(root, 'nested', 'out.json'))).toBe(true);
  });

  it('rejects paths outside the root, including prefix look-alikes', () => {
    expect(isWithinRoot(root, join('C:', 'Users', 'me', 'secrets', 'out.json'))).toBe(false);
    expect(isWithinRoot(root, `${root}-other`)).toBe(false);
  });

  it('ignores case on Windows, where the filesystem does too', () => {
    setPlatform('win32');
    expect(isWithinRoot(root, join(root.toLowerCase(), 'out.json'))).toBe(true);
    expect(isWithinRoot(root, join(root.toUpperCase(), 'out.json'))).toBe(true);
  });

  it('still rejects an escape when case is ignored', () => {
    setPlatform('win32');
    expect(isWithinRoot(root, join('c:', 'users', 'me', 'secrets', 'out.json'))).toBe(false);
  });

  it('matches case exactly off Windows', () => {
    setPlatform('linux');
    expect(isWithinRoot(root, join(root.toLowerCase(), 'out.json'))).toBe(false);
  });
});
