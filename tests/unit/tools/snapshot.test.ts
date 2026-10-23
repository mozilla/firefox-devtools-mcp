/**
 * Unit tests for snapshot tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { removeDir } from '../../helpers/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  takeSnapshotTool,
  resolveUidToSelectorTool,
  clearSnapshotTool,
} from '../../../src/tools/snapshot.js';

describe('Snapshot Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(takeSnapshotTool.name).toBe('take_snapshot');
      expect(resolveUidToSelectorTool.name).toBe('resolve_uid_to_selector');
      expect(clearSnapshotTool.name).toBe('clear_snapshot');
    });

    it('should have valid descriptions', () => {
      expect(takeSnapshotTool.description).toContain('snapshot');
      expect(resolveUidToSelectorTool.description).toContain('UID');
      expect(clearSnapshotTool.description).toContain('Clear');
    });

    it('should have valid input schemas', () => {
      expect(takeSnapshotTool.inputSchema.type).toBe('object');
      expect(resolveUidToSelectorTool.inputSchema.type).toBe('object');
      expect(clearSnapshotTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('takeSnapshotTool should have snapshot options', () => {
      const { properties } = takeSnapshotTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.maxLines).toBeDefined();
      expect(properties?.includeAttributes).toBeDefined();
      expect(properties?.includeText).toBeDefined();
      expect(properties?.maxDepth).toBeDefined();
    });

    it('takeSnapshotTool options should have correct types', () => {
      const { properties } = takeSnapshotTool.inputSchema;
      expect(properties?.maxLines.type).toBe('number');
      expect(properties?.includeAttributes.type).toBe('boolean');
      expect(properties?.includeText.type).toBe('boolean');
      expect(properties?.maxDepth.type).toBe('number');
    });

    it('takeSnapshotTool should have includeAll property with boolean type', () => {
      const { properties } = takeSnapshotTool.inputSchema;
      expect(properties?.includeAll).toBeDefined();
      expect(properties?.includeAll.type).toBe('boolean');
    });

    it('takeSnapshotTool should have selector property with string type', () => {
      const { properties } = takeSnapshotTool.inputSchema;
      expect(properties?.selector).toBeDefined();
      expect(properties?.selector.type).toBe('string');
    });

    it('resolveUidToSelectorTool should require uid', () => {
      const { properties, required } = resolveUidToSelectorTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.uid).toBeDefined();
      expect(required).toContain('uid');
    });

    it('takeSnapshotTool should have optional saveTo and preview', () => {
      const { properties } = takeSnapshotTool.inputSchema;
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo.type).toEqual(['boolean', 'string']);
      expect(properties?.preview).toBeDefined();
      expect(properties?.preview.type).toBe('number');
    });
  });

  describe('Handler: saveTo behavior', () => {
    const ROOT = {
      uid: 'uid-root',
      role: 'main',
      tag: 'div',
      children: [
        { uid: 'uid-1', role: 'button', tag: 'button', name: 'One', children: [] },
        { uid: 'uid-2', role: 'button', tag: 'button', name: 'Two', children: [] },
        { uid: 'uid-3', role: 'button', tag: 'button', name: 'Three', children: [] },
      ],
    };
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `snapshot-test-${Date.now()}`);

      vi.doMock('../../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          takeSnapshot: vi.fn().mockResolvedValue({ json: { root: ROOT, truncated: false } }),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(tempDir)) {
        removeDir(tempDir);
      }
    });

    it('should save the full snapshot tree ignoring maxLines', async () => {
      const { handleTakeSnapshot } = await import('../../../src/tools/snapshot.js');
      const filePath = join(tempDir, 'snapshot.txt');
      const result = await handleTakeSnapshot({ saveTo: filePath, maxLines: 1 });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Snapshot saved to:');
      const fileContent = readFileSync(filePath, 'utf8');
      expect(fileContent).toContain('uid=uid-1');
      expect(fileContent).toContain('uid=uid-2');
      expect(fileContent).toContain('uid=uid-3');
      expect(fileContent.split('\n').length).toBeGreaterThan(1);
    });

    it('should include a preview when preview is given', async () => {
      const { handleTakeSnapshot } = await import('../../../src/tools/snapshot.js');
      const result = await handleTakeSnapshot({
        saveTo: join(tempDir, 'snapshot.txt'),
        preview: 100,
      });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Preview:');
    });
  });
});
