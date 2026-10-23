/**
 * Advanced unit tests for snapshot formatter
 */

import { describe, it, expect } from 'vitest';
import { formatSnapshotTree } from '../../../../src/firefox/snapshot/formatter.js';
import type { SnapshotNode } from '../../../../src/firefox/snapshot/types.js';

describe('Snapshot Formatter - Advanced Cases', () => {
  describe('ARIA Attributes', () => {
    it('should format checked state', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'checkbox',
        tag: 'input',
        aria: {
          checked: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('checked');
    });

    it('should format selected state', () => {
      const node: SnapshotNode = {
        uid: 'uid-2',
        role: 'option',
        tag: 'option',
        aria: {
          selected: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('selected');
    });

    it('should format expanded state', () => {
      const node: SnapshotNode = {
        uid: 'uid-3',
        role: 'button',
        tag: 'button',
        aria: {
          expanded: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('expanded');
    });

    it('should format pressed state', () => {
      const node: SnapshotNode = {
        uid: 'uid-4',
        role: 'button',
        tag: 'button',
        aria: {
          pressed: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('pressed');
    });

    it('should format hidden state', () => {
      const node: SnapshotNode = {
        uid: 'uid-7',
        role: 'region',
        tag: 'div',
        aria: {
          hidden: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('hidden');
    });

    it('should format level attribute', () => {
      const node: SnapshotNode = {
        uid: 'uid-8',
        role: 'heading',
        tag: 'h2',
        aria: {
          level: 2,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('level=2');
    });

    it('should format autocomplete attribute', () => {
      const node: SnapshotNode = {
        uid: 'uid-9',
        role: 'textbox',
        tag: 'input',
        aria: {
          autocomplete: 'list',
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('autocomplete="list"');
    });

    it('should format haspopup attribute', () => {
      const node: SnapshotNode = {
        uid: 'uid-10',
        role: 'button',
        tag: 'button',
        aria: {
          haspopup: 'menu',
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('haspopup="menu"');
    });

    it('should format invalid attribute', () => {
      const node: SnapshotNode = {
        uid: 'uid-11',
        role: 'textbox',
        tag: 'input',
        aria: {
          invalid: 'true',
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('invalid="true"');
    });

    it('should format multiple ARIA attributes together', () => {
      const node: SnapshotNode = {
        uid: 'uid-12',
        role: 'textbox',
        tag: 'input',
        aria: {
          disabled: true,
          hidden: true,
          invalid: 'grammar',
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('disabled');
      expect(result).toContain('hidden');
      expect(result).toContain('invalid="grammar"');
    });

    it('should not include ARIA when includeAttributes is false', () => {
      const node: SnapshotNode = {
        uid: 'uid-13',
        role: 'button',
        tag: 'button',
        aria: {
          disabled: true,
          pressed: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node, 0, { includeAttributes: false });
      expect(result).not.toContain('disabled');
      expect(result).not.toContain('pressed');
    });
  });

  describe('Computed Properties', () => {
    it('should format focusable', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'button',
        tag: 'button',
        computed: {
          focusable: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('focusable');
    });

    it('should format interactive', () => {
      const node: SnapshotNode = {
        uid: 'uid-2',
        role: 'link',
        tag: 'a',
        computed: {
          interactive: true,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('interactive');
    });

    it('should format invisible', () => {
      const node: SnapshotNode = {
        uid: 'uid-3',
        role: 'region',
        tag: 'div',
        computed: {
          visible: false,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('invisible');
    });

    it('should format inaccessible', () => {
      const node: SnapshotNode = {
        uid: 'uid-4',
        role: 'region',
        tag: 'div',
        computed: {
          accessible: false,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('inaccessible');
    });
  });

  describe('Iframe Properties', () => {
    it('should format iframe marker', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'iframe',
        tag: 'iframe',
        isIframe: true,
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('[iframe');
      expect(result).toContain(']');
    });

    it('should format iframe with src', () => {
      const node: SnapshotNode = {
        uid: 'uid-2',
        role: 'iframe',
        tag: 'iframe',
        isIframe: true,
        frameSrc: 'https://example.com/frame',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('[iframe');
      expect(result).toContain('src="https://example.com/frame"');
    });

    it('should format cross-origin iframe', () => {
      const node: SnapshotNode = {
        uid: 'uid-3',
        role: 'iframe',
        tag: 'iframe',
        isIframe: true,
        crossOrigin: true,
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('cross-origin');
    });
  });

  describe('Edge Cases', () => {
    it('should handle node without role', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        tag: 'div',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=uid-1');
      expect(result).toContain('div');
    });

    it('should handle empty children array', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'button',
        tag: 'button',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toBeTruthy();
      expect(result).toContain('button');
    });

    it('should handle deeply nested structure', () => {
      const node: SnapshotNode = {
        uid: 'level-1',
        role: 'main',
        tag: 'main',
        children: [
          {
            uid: 'level-2',
            role: 'section',
            tag: 'section',
            children: [
              {
                uid: 'level-3',
                role: 'article',
                tag: 'article',
                children: [
                  {
                    uid: 'level-4',
                    role: 'button',
                    tag: 'button',
                    name: 'Deep Button',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=level-1');
      expect(result).toContain('uid=level-2');
      expect(result).toContain('uid=level-3');
      expect(result).toContain('uid=level-4');
    });

    it('should handle maxDepth at depth 0', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'main',
        tag: 'div',
        children: [
          {
            uid: 'uid-2',
            role: 'button',
            tag: 'button',
            children: [],
          },
        ],
      };

      const result = formatSnapshotTree(node, 0, { maxDepth: 0 });
      expect(result).toBe('');
    });

    it('should handle node with all optional properties', () => {
      const node: SnapshotNode = {
        uid: 'uid-full',
        role: 'link',
        tag: 'a',
        name: 'Home Link',
        value: 'home',
        href: 'https://example.com',
        src: '/logo.png',
        text: 'Go Home',
        aria: {
          disabled: true,
          hidden: true,
          level: 1,
        },
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('uid=uid-full');
      expect(result).toContain('link');
      expect(result).toContain('"Home Link"');
      expect(result).toContain('value="home"');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('src="/logo.png"');
      expect(result).toContain('text="Go Home"');
      expect(result).toContain('disabled');
      expect(result).toContain('hidden');
      expect(result).toContain('level=1');
    });
  });

  describe('Special Characters', () => {
    it('should handle quotes in name', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'button',
        tag: 'button',
        name: 'Click "here"',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('Click "here"');
    });

    it('should handle newlines in text', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'text',
        tag: 'p',
        text: 'Line 1\nLine 2',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('text=');
    });

    it('should handle unicode characters', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'button',
        tag: 'button',
        name: '🚀 Launch',
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).toContain('🚀 Launch');
    });
  });

  describe('Attribute Truncation', () => {
    const longHref = 'https://example.com/' + 'a'.repeat(100);

    it('should truncate long attribute values to 30 chars by default', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'link',
        tag: 'a',
        href: longHref,
        children: [],
      };

      const result = formatSnapshotTree(node);
      expect(result).not.toContain(longHref);
      expect(result).toContain('...');
    });

    it('should keep values untruncated when maxAttrLength is Infinity', () => {
      const node: SnapshotNode = {
        uid: 'uid-1',
        role: 'link',
        tag: 'a',
        href: longHref,
        children: [],
      };

      const result = formatSnapshotTree(node, 0, { maxAttrLength: Infinity });
      expect(result).toContain(longHref);
    });
  });
});
