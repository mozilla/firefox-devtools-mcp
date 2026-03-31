// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { walkTree } from '@/firefox/snapshot/injected/treeWalker.js';

beforeAll(() => {
  // jsdom doesn't implement CSS.escape
  if (typeof CSS === 'undefined') {
    (globalThis as any).CSS = {};
  }
  if (!CSS.escape) {
    CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
  }

  // jsdom getComputedStyle returns '' for opacity (browsers return '1')
  const origGCS = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (elt: Element, pseudoElt?: string | null) => {
      const style = origGCS.call(window, elt, pseudoElt);
      return new Proxy(style, {
        get(target: CSSStyleDeclaration, prop: string | symbol) {
          if (prop === 'opacity') {
            return target.opacity === '' ? '1' : target.opacity;
          }
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }
  );
});

describe('treeWalker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('basic walkTree', () => {
    it('returns tree rooted at body with correct uid prefix', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Click';
      document.body.appendChild(btn);

      const result = walkTree(document.body, 42);
      expect(result.tree).not.toBeNull();
      expect(result.tree!.tag).toBe('body');
      expect(result.tree!.uid).toMatch(/^42_/);
      expect(result.uidMap.length).toBeGreaterThan(0);
      expect(result.uidMap[0].uid).toMatch(/^42_/);
    });

    it('populates uidMap entries', () => {
      const btn = document.createElement('button');
      btn.textContent = 'OK';
      document.body.appendChild(btn);

      const result = walkTree(document.body, 1);
      // button + body = at least 2
      expect(result.uidMap.length).toBeGreaterThanOrEqual(2);
      for (const entry of result.uidMap) {
        expect(entry.uid).toBeDefined();
        expect(entry.css).toBeDefined();
      }
    });

    it('returns truncated=false for small trees', () => {
      document.body.innerHTML = '<button>A</button>';
      const result = walkTree(document.body, 1);
      expect(result.truncated).toBe(false);
    });
  });

  describe('bubble-up pattern', () => {
    // Use <aside> as irrelevant wrapper: not in INTERACTIVE_TAGS, SEMANTIC_TAGS, or CONTAINER_TAGS
    it('bubbles relevant child through irrelevant parent', () => {
      document.body.innerHTML = '<aside><button>OK</button></aside>';

      const result = walkTree(document.body, 1);
      expect(result.tree).not.toBeNull();
      // Button should bubble up through irrelevant <aside> to body
      const hasButton = result.tree!.children.some((c) => c.tag === 'button');
      expect(hasButton).toBe(true);
    });

    it('bubbles deeply nested relevant child up', () => {
      document.body.innerHTML =
        '<aside><aside><aside><button>Deep</button></aside></aside></aside>';

      const result = walkTree(document.body, 1);
      expect(result.tree).not.toBeNull();
      const findButton = (node: any): boolean => {
        if (node.tag === 'button') return true;
        return node.children?.some((c: any) => findButton(c)) ?? false;
      };
      expect(findButton(result.tree)).toBe(true);
    });

    it('relevant parent keeps its structure', () => {
      // <nav> is semantic → always relevant
      document.body.innerHTML = '<nav><button>Menu</button></nav>';

      const result = walkTree(document.body, 1);
      expect(result.tree).not.toBeNull();
      const nav = result.tree!.children.find((c) => c.tag === 'nav');
      expect(nav).toBeDefined();
      const btn = nav!.children.find((c) => c.tag === 'button');
      expect(btn).toBeDefined();
    });
  });

  describe('includeAll mode', () => {
    it('includes all visible elements', () => {
      document.body.innerHTML = '<div><span>text</span></div>';

      const standard = walkTree(document.body, 1, { includeAll: false });
      const includeAll = walkTree(document.body, 2, { includeAll: true });

      // includeAll should have more or equal nodes
      expect(includeAll.uidMap.length).toBeGreaterThanOrEqual(standard.uidMap.length);
    });

    it('still hides display:none elements', () => {
      document.body.innerHTML = '<div style="display:none"><span>hidden</span></div>';

      const result = walkTree(document.body, 1, { includeAll: true });
      expect(result.tree!.children.length).toBe(0);
    });

    it('always includes root element', () => {
      document.body.innerHTML = '';
      const result = walkTree(document.body, 1, { includeAll: true });
      expect(result.tree).not.toBeNull();
      expect(result.tree!.tag).toBe('body');
    });
  });

  describe('limits', () => {
    it('sets truncated=true when MAX_DEPTH (10) is exceeded', () => {
      // Build a DOM tree 12 levels deep with semantic (relevant) nodes
      let html = '';
      for (let i = 0; i < 12; i++) html += '<nav>';
      html += '<button>deep</button>';
      for (let i = 0; i < 12; i++) html += '</nav>';
      document.body.innerHTML = html;

      const result = walkTree(document.body, 1);
      expect(result.truncated).toBe(true);
    });

    it('sets truncated=true when MAX_NODES (1000) is exceeded', () => {
      // Use groups of 100 to avoid O(n²) sibling counting in selector generation
      let html = '';
      for (let g = 0; g < 11; g++) {
        html += '<nav>';
        for (let i = 0; i < 100; i++) {
          html += `<button>b${g * 100 + i}</button>`;
        }
        html += '</nav>';
      }
      document.body.innerHTML = html;

      const result = walkTree(document.body, 1);
      expect(result.truncated).toBe(true);
      // Should cap around 1000 nodes (body + navs + buttons)
      expect(result.uidMap.length).toBeLessThan(1100);
    }, 30000);
  });

  describe('iframes', () => {
    it('marks cross-origin iframe with crossOrigin flag', () => {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://example.com';
      // Simulate cross-origin: contentDocument inaccessible
      Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });
      document.body.appendChild(iframe);

      const result = walkTree(document.body, 1, { includeIframes: true });
      const findIframe = (node: any): any => {
        if (node.tag === 'iframe') return node;
        for (const c of node.children || []) {
          const found = findIframe(c);
          if (found) return found;
        }
        return null;
      };
      const iframeNode = findIframe(result.tree);
      expect(iframeNode).not.toBeNull();
      expect(iframeNode.crossOrigin).toBe(true);
      expect(iframeNode.isIframe).toBe(true);
    });

    it('does not set crossOrigin when includeIframes is false', () => {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://example.com';
      Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });
      document.body.appendChild(iframe);

      const result = walkTree(document.body, 1, { includeIframes: false });
      const findIframe = (node: any): any => {
        if (node.tag === 'iframe') return node;
        for (const c of node.children || []) {
          const found = findIframe(c);
          if (found) return found;
        }
        return null;
      };
      const iframeNode = findIframe(result.tree);
      // iframe is still an interactive tag so it appears in tree
      // but without includeIframes, crossOrigin/isIframe are not set
      if (iframeNode) {
        expect(iframeNode.crossOrigin).toBeUndefined();
      }
    });
  });
});
