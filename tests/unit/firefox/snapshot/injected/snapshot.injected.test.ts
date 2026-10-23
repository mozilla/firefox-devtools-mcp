// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  clearUidRegistry,
  createSnapshot,
  resolveUid,
  uidToSelector,
} from '@/firefox/snapshot/injected/snapshot.injected.js';

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

describe('snapshot.injected - createSnapshot', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    // The registry lives on the window, which jsdom keeps between tests
    clearUidRegistry();
  });

  describe('default behavior', () => {
    it('walks from document.body and returns tree', () => {
      document.body.innerHTML = '<button>OK</button>';

      const result = createSnapshot(1);
      expect(result.tree).not.toBeNull();
      expect(result.tree!.tag).toBe('body');
      expect(result.nodeCount).toBeGreaterThan(0);
    });

    it('counts the nodes it emitted', () => {
      document.body.innerHTML = '<button>A</button><input />';

      const result = createSnapshot(1);
      // body + button + input = at least 3
      expect(result.nodeCount).toBeGreaterThanOrEqual(3);
    });

    it('has no selectorError by default', () => {
      document.body.innerHTML = '<button>OK</button>';

      const result = createSnapshot(1);
      expect(result.selectorError).toBeUndefined();
    });
  });

  describe('selector option', () => {
    it('scopes to matched element', () => {
      document.body.innerHTML =
        '<div id="app"><button>Inside</button></div><button>Outside</button>';

      const result = createSnapshot(1, { selector: '#app' });
      expect(result.tree).not.toBeNull();
      expect(result.tree!.tag).toBe('div');
      expect(result.selectorError).toBeUndefined();
    });

    it('returns selectorError when element not found', () => {
      document.body.innerHTML = '<div>Hello</div>';

      const result = createSnapshot(1, { selector: '#nonexistent' });
      expect(result.tree).toBeNull();
      expect(result.selectorError).toContain('not found');
    });

    it('returns selectorError for invalid selector syntax', () => {
      document.body.innerHTML = '<div>Hello</div>';

      // Mock querySelector to throw (jsdom may not throw for all invalid selectors)
      const spy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
        throw new DOMException('is not a valid selector');
      });

      const result = createSnapshot(1, { selector: '[[[' });
      expect(result.tree).toBeNull();
      expect(result.selectorError).toContain('Invalid selector syntax');

      spy.mockRestore();
    });
  });

  describe('includeAll option', () => {
    it('forwards includeAll to walkTree', () => {
      document.body.innerHTML = '<div><span>text</span></div>';

      const standard = createSnapshot(1);
      const includeAll = createSnapshot(2, { includeAll: true });

      // includeAll should produce at least as many nodes
      expect(includeAll.nodeCount).toBeGreaterThanOrEqual(standard.nodeCount);
    });
  });

  describe('uid resolution', () => {
    it('resolves a uid from the snapshot back to its element', () => {
      document.body.innerHTML = '<div id="app"><button id="go">OK</button></div>';

      const result = createSnapshot(1);
      const button = findNode(result.tree, (node) => node.tag === 'button');

      expect(resolveUid(button.uid)).toBe(document.getElementById('go'));
    });

    it('generates a css selector for a uid on demand', () => {
      document.body.innerHTML = '<div id="app"><button id="go">OK</button></div>';

      const result = createSnapshot(1);
      const button = findNode(result.tree, (node) => node.tag === 'button');

      const selector = uidToSelector(button.uid);
      expect(selector).toBe('button#go');
      expect(document.querySelector(selector!)).toBe(document.getElementById('go'));
    });

    it('does not remember uids when the walk throws', () => {
      document.body.innerHTML = '<button id="first">A</button><button id="boom">B</button>';
      // The first button is walked (and assigned e1) before the second one blows up
      Object.defineProperty(document.getElementById('boom'), 'tagName', {
        get() {
          throw new Error('boom');
        },
      });

      const result = createSnapshot(1);

      expect(result.tree).toBeNull();
      expect(result.nextElementId).toBe(1);
      expect(resolveUid('e1')).toBeNull();
    });

    it('returns null for unknown uids', () => {
      expect(resolveUid('e99')).toBeNull();
      expect(uidToSelector('e99')).toBeNull();
    });

    it('returns null after the registry is cleared', () => {
      document.body.innerHTML = '<button id="go">OK</button>';

      const result = createSnapshot(1);
      const button = findNode(result.tree, (node) => node.tag === 'button');

      clearUidRegistry();

      expect(resolveUid(button.uid)).toBeNull();
    });
  });

  describe('window globals', () => {
    it('registers the snapshot and uid helpers on window', () => {
      for (const name of [
        '__createSnapshot',
        '__resolveUid',
        '__uidToSelector',
        '__clearUidRegistry',
      ]) {
        expect(typeof (window as any)[name]).toBe('function');
      }
    });
  });
});

function findNode(node: any, predicate: (node: any) => boolean): any {
  if (!node) {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}
