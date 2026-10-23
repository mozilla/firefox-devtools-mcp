/**
 * Unit tests for press_key combination parsing
 */

import { describe, it, expect } from 'vitest';
import { Key } from 'selenium-webdriver';
import { parseKeyCombo } from '../../../src/firefox/dom.js';

describe('parseKeyCombo', () => {
  describe('named keys', () => {
    it('maps enter and return to the main keyboard key', () => {
      expect(Key.RETURN).not.toBe(Key.ENTER);
      expect(parseKeyCombo('Return')).toEqual({ modifiers: [], key: Key.RETURN });
      expect(parseKeyCombo('Enter')).toEqual({ modifiers: [], key: Key.RETURN });
    });

    it('keeps the numpad enter reachable under its own name', () => {
      expect(parseKeyCombo('NumpadEnter')).toEqual({ modifiers: [], key: Key.ENTER });
    });

    it('matches key names case-insensitively', () => {
      expect(parseKeyCombo('escape').key).toBe(Key.ESCAPE);
      expect(parseKeyCombo('Escape').key).toBe(Key.ESCAPE);
      expect(parseKeyCombo('ESCAPE').key).toBe(Key.ESCAPE);
    });

    it('accepts short aliases', () => {
      expect(parseKeyCombo('esc').key).toBe(Key.ESCAPE);
      expect(parseKeyCombo('up').key).toBe(Key.ARROW_UP);
      expect(parseKeyCombo('ArrowUp').key).toBe(Key.ARROW_UP);
      expect(parseKeyCombo('down').key).toBe(Key.ARROW_DOWN);
      expect(parseKeyCombo('left').key).toBe(Key.ARROW_LEFT);
      expect(parseKeyCombo('right').key).toBe(Key.ARROW_RIGHT);
    });

    it('supports function, navigation and numpad keys', () => {
      expect(parseKeyCombo('F1').key).toBe(Key.F1);
      expect(parseKeyCombo('F12').key).toBe(Key.F12);
      expect(parseKeyCombo('PageDown').key).toBe(Key.PAGE_DOWN);
      expect(parseKeyCombo('Home').key).toBe(Key.HOME);
      expect(parseKeyCombo('Backspace').key).toBe(Key.BACK_SPACE);
      expect(parseKeyCombo('Space').key).toBe(Key.SPACE);
      expect(parseKeyCombo('Numpad7').key).toBe(Key.NUMPAD7);
      expect(parseKeyCombo('Subtract').key).toBe(Key.SUBTRACT);
    });
  });

  describe('modifiers', () => {
    it('separates modifiers from the key', () => {
      expect(parseKeyCombo('ctrl+l')).toEqual({ modifiers: [Key.CONTROL], key: 'l' });
    });

    it('keeps every modifier of a combination, in order', () => {
      expect(parseKeyCombo('ctrl+shift+t')).toEqual({
        modifiers: [Key.CONTROL, Key.SHIFT],
        key: 't',
      });
    });

    it('accepts a modifier after the key', () => {
      expect(parseKeyCombo('F4+alt')).toEqual({ modifiers: [Key.ALT], key: Key.F4 });
    });

    it('accepts modifier aliases', () => {
      expect(parseKeyCombo('control+a').modifiers).toEqual([Key.CONTROL]);
      for (const alias of ['meta', 'cmd', 'command', 'win', 'super']) {
        expect(parseKeyCombo(`${alias}+a`).modifiers).toEqual([Key.META]);
      }
    });

    it('combines modifiers with named keys', () => {
      expect(parseKeyCombo('alt+ArrowLeft')).toEqual({
        modifiers: [Key.ALT],
        key: Key.ARROW_LEFT,
      });
    });

    it('ignores whitespace around each part', () => {
      expect(parseKeyCombo(' ctrl + shift + t ')).toEqual({
        modifiers: [Key.CONTROL, Key.SHIFT],
        key: 't',
      });
    });
  });

  describe('single characters', () => {
    it('passes an unmapped single character through unchanged', () => {
      expect(parseKeyCombo('a').key).toBe('a');
      expect(parseKeyCombo('7').key).toBe('7');
    });

    it('preserves the case of a single character', () => {
      expect(parseKeyCombo('A').key).toBe('A');
    });

    it('takes a lone separator as the plus key', () => {
      expect(parseKeyCombo('+')).toEqual({ modifiers: [], key: '+' });
    });
  });

  describe('rejected input', () => {
    it('rejects more than one non-modifier key', () => {
      expect(() => parseKeyCombo('ctrl+k+l')).toThrow(/more than one non-modifier key/);
      expect(() => parseKeyCombo('a+b')).toThrow(/more than one non-modifier key/);
    });

    it('rejects an unknown key name rather than typing it', () => {
      expect(() => parseKeyCombo('foobar')).toThrow(/unknown key "foobar"/);
      expect(() => parseKeyCombo('ctrl+hello')).toThrow(/unknown key "hello"/);
    });

    it('rejects a combination with no key', () => {
      expect(() => parseKeyCombo('ctrl+shift')).toThrow(/no key specified/);
      expect(() => parseKeyCombo('')).toThrow(/no key specified/);
      expect(() => parseKeyCombo('   ')).toThrow(/no key specified/);
    });
  });
});
