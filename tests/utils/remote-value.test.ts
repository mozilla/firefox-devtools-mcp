import { describe, it, expect } from 'vitest';
import { remoteValueToNative } from '../../src/utils/remote-value.js';

describe('remoteValueToNative', () => {
  describe('primitives', () => {
    it('converts undefined', () => {
      expect(remoteValueToNative({ type: 'undefined' })).toBeUndefined();
    });

    it('converts null', () => {
      expect(remoteValueToNative({ type: 'null' })).toBeNull();
    });

    it('converts string', () => {
      expect(remoteValueToNative({ type: 'string', value: 'hello' })).toBe('hello');
    });

    it('converts boolean true', () => {
      expect(remoteValueToNative({ type: 'boolean', value: true })).toBe(true);
    });

    it('converts boolean false', () => {
      expect(remoteValueToNative({ type: 'boolean', value: false })).toBe(false);
    });

    it('converts number', () => {
      expect(remoteValueToNative({ type: 'number', value: 42 })).toBe(42);
    });

    it('converts NaN to string', () => {
      expect(remoteValueToNative({ type: 'number', value: 'NaN' })).toBe('NaN');
    });

    it('converts Infinity to string', () => {
      expect(remoteValueToNative({ type: 'number', value: 'Infinity' })).toBe('Infinity');
    });

    it('converts -Infinity to string', () => {
      expect(remoteValueToNative({ type: 'number', value: '-Infinity' })).toBe('-Infinity');
    });

    it('converts -0 to string', () => {
      expect(remoteValueToNative({ type: 'number', value: '-0' })).toBe('-0');
    });

    it('converts bigint', () => {
      expect(remoteValueToNative({ type: 'bigint', value: '9007199254740993' })).toBe(
        '9007199254740993n'
      );
    });
  });

  describe('collections', () => {
    it('converts array', () => {
      expect(
        remoteValueToNative({
          type: 'array',
          value: [
            { type: 'number', value: 1 },
            { type: 'string', value: 'two' },
          ],
        })
      ).toEqual([1, 'two']);
    });

    it('converts nested array', () => {
      expect(
        remoteValueToNative({
          type: 'array',
          value: [{ type: 'array', value: [{ type: 'number', value: 1 }] }],
        })
      ).toEqual([[1]]);
    });

    it('converts object', () => {
      expect(
        remoteValueToNative({
          type: 'object',
          value: [
            ['title', { type: 'string', value: 'Google' }],
            ['count', { type: 'number', value: 641 }],
          ],
        })
      ).toEqual({ title: 'Google', count: 641 });
    });

    it('converts nested object', () => {
      expect(
        remoteValueToNative({
          type: 'object',
          value: [['nested', { type: 'object', value: [['x', { type: 'number', value: 1 }]] }]],
        })
      ).toEqual({ nested: { x: 1 } });
    });

    it('converts map', () => {
      expect(
        remoteValueToNative({
          type: 'map',
          value: [
            ['key1', { type: 'string', value: 'value1' }],
            ['key2', { type: 'number', value: 2 }],
          ],
        })
      ).toEqual({ key1: 'value1', key2: 2 });
    });

    it('converts set', () => {
      expect(
        remoteValueToNative({
          type: 'set',
          value: [
            { type: 'number', value: 1 },
            { type: 'number', value: 2 },
          ],
        })
      ).toEqual([1, 2]);
    });
  });

  describe('special types', () => {
    it('converts regexp', () => {
      expect(remoteValueToNative({ type: 'regexp', value: { pattern: 'foo', flags: 'gi' } })).toBe(
        '/foo/gi'
      );
    });

    it('converts regexp without flags', () => {
      expect(remoteValueToNative({ type: 'regexp', value: { pattern: 'bar' } })).toBe('/bar/');
    });

    it('converts date', () => {
      expect(remoteValueToNative({ type: 'date', value: '2024-01-01T00:00:00.000Z' })).toBe(
        '2024-01-01T00:00:00.000Z'
      );
    });
  });

  describe('fallback', () => {
    it('returns [type] for node', () => {
      expect(remoteValueToNative({ type: 'node' })).toBe('[node]');
    });

    it('returns [type] for function', () => {
      expect(remoteValueToNative({ type: 'function' })).toBe('[function]');
    });

    it('returns [type] for promise', () => {
      expect(remoteValueToNative({ type: 'promise' })).toBe('[promise]');
    });
  });
});
