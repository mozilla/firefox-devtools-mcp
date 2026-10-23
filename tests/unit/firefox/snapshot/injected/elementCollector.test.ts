// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  isVisible,
  isRelevant,
  isFocusable,
  isInteractive,
} from '@/firefox/snapshot/injected/elementCollector.js';

beforeAll(() => {
  // jsdom getComputedStyle returns '' for opacity (browsers return '1')
  // This causes parseFloat('') → NaN → isNaN(NaN) → every element appears invisible
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

function createElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

describe('elementCollector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('isVisible', () => {
    it('returns false for null', () => {
      expect(isVisible(null as any)).toBe(false);
    });

    it('returns false for non-element node', () => {
      const text = document.createTextNode('hello');
      expect(isVisible(text as any)).toBe(false);
    });

    it('returns false for display:none', () => {
      const el = createElement('div', { style: 'display:none' });
      expect(isVisible(el)).toBe(false);
    });

    it('returns false for visibility:hidden', () => {
      const el = createElement('div', { style: 'visibility:hidden' });
      expect(isVisible(el)).toBe(false);
    });

    it('returns false for opacity:0', () => {
      const el = createElement('div', { style: 'opacity:0' });
      expect(isVisible(el)).toBe(false);
    });

    it('returns false when ancestor is hidden', () => {
      const parent = createElement('div', { style: 'display:none' });
      const child = document.createElement('span');
      parent.appendChild(child);
      expect(isVisible(child)).toBe(false);
    });

    it('returns true for a normal visible element', () => {
      const el = createElement('div');
      expect(isVisible(el)).toBe(true);
    });
  });

  describe('isRelevant', () => {
    it('returns false for null', () => {
      expect(isRelevant(null as any)).toBe(false);
    });

    it('returns true for interactive tags', () => {
      for (const tag of [
        'button',
        'input',
        'select',
        'textarea',
        'a',
        'img',
        'video',
        'audio',
        'iframe',
      ]) {
        const el = createElement(tag);
        expect(isRelevant(el)).toBe(true);
      }
    });

    it('returns true for element with role attribute', () => {
      const el = createElement('div', { role: 'dialog' });
      expect(isRelevant(el)).toBe(true);
    });

    it('returns true for element with aria-label', () => {
      const el = createElement('div', { 'aria-label': 'Close' });
      expect(isRelevant(el)).toBe(true);
    });

    it('returns true for headings', () => {
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const el = createElement(tag);
        expect(isRelevant(el)).toBe(true);
      }
    });

    it('returns true for semantic tags', () => {
      for (const tag of ['nav', 'main', 'section', 'article', 'header', 'footer', 'form']) {
        const el = createElement(tag);
        expect(isRelevant(el)).toBe(true);
      }
    });

    it('returns true for container with direct text', () => {
      const el = createElement('div');
      el.textContent = 'Hello world';
      expect(isRelevant(el)).toBe(true);
    });

    it('returns true for container with id', () => {
      const el = createElement('div', { id: 'main-content' });
      expect(isRelevant(el)).toBe(true);
    });

    it('returns true for container with class', () => {
      const el = createElement('div', { class: 'wrapper' });
      expect(isRelevant(el)).toBe(true);
    });

    it('returns true for container with interactive child', () => {
      const el = createElement('div');
      const btn = document.createElement('button');
      el.appendChild(btn);
      expect(isRelevant(el)).toBe(true);
    });

    it('returns false for empty div without id/class', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      expect(isRelevant(el)).toBe(false);
    });

    it('returns false for div with only nested text (no direct text)', () => {
      const el = document.createElement('div');
      const inner = document.createElement('span');
      inner.textContent = 'nested';
      el.appendChild(inner);
      document.body.appendChild(el);
      expect(isRelevant(el)).toBe(false);
    });

    it('returns false for hidden element', () => {
      const el = createElement('button', { style: 'display:none' });
      expect(isRelevant(el)).toBe(false);
    });
  });

  describe('isFocusable', () => {
    it('returns true for element with tabIndex >= 0', () => {
      const el = createElement('div', { tabindex: '0' });
      expect(isFocusable(el)).toBe(true);
    });

    it('returns true for natively focusable tags', () => {
      for (const tag of ['a', 'button', 'input', 'select', 'textarea']) {
        const el = createElement(tag);
        expect(isFocusable(el)).toBe(true);
      }
    });

    it('returns false for div without tabindex', () => {
      const el = createElement('div');
      expect(isFocusable(el)).toBe(false);
    });
  });

  describe('isInteractive', () => {
    it('returns true for interactive tags', () => {
      for (const tag of ['button', 'input', 'select', 'textarea', 'a', 'img']) {
        const el = createElement(tag);
        expect(isInteractive(el)).toBe(true);
      }
    });

    it('returns true for elements with interactive roles', () => {
      for (const role of ['button', 'link', 'menuitem', 'tab']) {
        const el = createElement('div', { role });
        expect(isInteractive(el)).toBe(true);
      }
    });

    it('returns true for element with onclick', () => {
      const el = createElement('div', { onclick: 'doSomething()' });
      expect(isInteractive(el)).toBe(true);
    });

    it('returns false for plain div', () => {
      const el = createElement('div');
      expect(isInteractive(el)).toBe(false);
    });
  });
});
