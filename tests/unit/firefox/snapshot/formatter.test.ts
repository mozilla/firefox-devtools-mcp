/**
 * Unit tests for snapshot formatter
 */

import { describe, it, expect } from 'vitest';
import { formatSnapshotTree } from '../../../../src/firefox/snapshot/formatter.js';
import type { SnapshotNode } from '../../../../src/firefox/snapshot/types.js';

describe('Snapshot Formatter', () => {
  describe('formatSnapshotTree', () => {
    it('should format a simple node', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'button',
        tag: 'button',
        name: 'Click me',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=uid-1');
      expect(result).toContain('button');
      expect(result).toContain('"Click me"');
    });

    it('should format node with value', () => {
      const node: SnapshotNode = {
        uid: 'uid-2',
        role: 'textbox',
        tag: 'input',
        name: 'Username',
        value: 'john_doe',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=uid-2');
      expect(result).toContain('value="john_doe"');
    });

    it('should format node with href', () => {
      const node: SnapshotNode = {
        uid: 'uid-3',
        role: 'link',
        tag: 'a',
        name: 'Home',
        href: 'https://example.com',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('href="https://example.com"');
    });

    it('should format node with src', () => {
      const node: SnapshotNode = {
        uid: 'uid-4',
        role: 'img',
        tag: 'img',
        src: '/images/logo.png',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('src="/images/logo.png"');
    });

    it('should format node with text when includeText is true', () => {
      const node: SnapshotNode = {
        uid: 'uid-5',
        role: 'text',
        tag: 'span',
        text: 'Hello World',
        children: [],
      };

      const result = formatSnapshotTree(node, 0, { includeText: true });
      expect(result).toContain('text="Hello World"');
    });

    it('should not format text when includeText is false', () => {
      const node: SnapshotNode = {
        uid: 'uid-6',
        role: 'text',
        tag: 'span',
        text: 'Hello World',
        children: [],
      };

      const result = formatSnapshotTree(node, 0, { includeText: false });
      expect(result).not.toContain('text=');
    });

    it('should format node with ARIA disabled', () => {
      const node: SnapshotNode = {
        uid: 'uid-7',
        role: 'button',
        tag: 'button',
        name: 'Submit',
        aria: {
          disabled: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('disabled');
    });

    it('should format nested nodes with indentation', () => {
      const node: SnapshotNode = {
        uid: 'uid-root',
        role: 'main',
        tag: 'div',
        children: [
          {
            uid: 'uid-child',
            role: 'button',
            tag: 'button',
            name: 'Child Button',
            children: [],
          },
        ],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=uid-root');
      expect(result).toContain('uid=uid-child');
      // Child should be indented
      expect(result).toMatch(/\s{2}uid=uid-child/);
    });

    it('should respect maxDepth option', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'main',
        tag: 'div',
        children: [
          {
            uid: 'uid-2',
            role: 'section',
            tag: 'div',
            children: [
              {
                uid: 'uid-3',
                role: 'button',
                tag: 'button',
                name: 'Deep Button',
                children: [],
              },
            ],
          },
        ],
      };

      const result = formatSnapshotTree(node, 0, { maxDepth: 2 });
      expect(result).toContain('uid=uid-1');
      expect(result).toContain('uid=uid-2');
      expect(result).not.toContain('uid=uid-3');
    });

    it('should truncate long attribute values', () => {
      const longText = 'a'.repeat(100);
      const node: SnapshotNode = {
        uid: 'uid-8',
        role: 'text',
        tag: 'span',
        name: longText,
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longText.length + 50);
    });

    it('should show tag when role differs from tag', () => {
      const node: SnapshotNode = {
        uid: 'uid-9',
        role: 'button',
        tag: 'div',
        name: 'Custom Button',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('tag=div');
    });

    it('should not show tag when role matches tag', () => {
      const node: SnapshotNode = {
        uid: 'uid-10',
        role: 'button',
        tag: 'button',
        name: 'Normal Button',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).not.toContain('tag=button');
    });
  });
});
