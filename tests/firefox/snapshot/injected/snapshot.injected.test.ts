// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createSnapshot } from '@/firefox/snapshot/injected/snapshot.injected.js';

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
  });

  describe('default behavior', () => {
    it('walks from document.body and returns tree', () => {
      document.body.innerHTML = '<button>OK</button>';

      const result = createSnapshot(1);
      expect(result.tree).not.toBeNull();
      expect(result.tree!.tag).toBe('body');
      expect(result.uidMap.length).toBeGreaterThan(0);
    });

    it('returns uidMap with entries', () => {
      document.body.innerHTML = '<button>A</button><input />';

      const result = createSnapshot(1);
      // body + button + input = at least 3
      expect(result.uidMap.length).toBeGreaterThanOrEqual(3);
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
      expect(includeAll.uidMap.length).toBeGreaterThanOrEqual(standard.uidMap.length);
    });
  });

  describe('window global', () => {
    it('registers __createSnapshot on window', () => {
      expect((window as any).__createSnapshot).toBeDefined();
      expect(typeof (window as any).__createSnapshot).toBe('function');
    });
  });
});
