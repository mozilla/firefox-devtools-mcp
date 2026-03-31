/**
 * Unit tests for NetworkEvents header parsing
 */

import { describe, it, expect } from 'vitest';

// Test the header parsing logic that handles BiDi format
// BiDi returns headers as: { name: "header-name", value: { type: "string", value: "actual-value" } }
// Or sometimes as: { name: "header-name", value: "actual-value" }

/**
 * Replica of the parseHeaders logic for testing (matches src/firefox/events/network.ts)
 */
function parseHeaders(headers: any[]): Record<string, string> {
  const result: Record<string, string> = {};

  const normalizeValue = (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => normalizeValue(item))
        .filter((item): item is string => !!item);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('value' in obj) {
        return normalizeValue(obj.value);
      }
      if ('bytes' in obj) {
        return normalizeValue(obj.bytes);
      }
      try {
        return JSON.stringify(obj);
      } catch {
        return null;
      }
    }
    return String(value);
  };

  if (Array.isArray(headers)) {
    for (const h of headers) {
      const name = h?.name ? String(h.name).toLowerCase() : '';
      if (!name) {
        continue;
      }

      const normalizedValue = normalizeValue(h?.value);
      if (normalizedValue !== null) {
        result[name] = normalizedValue;
      }
    }
  }

  return result;
}

describe('NetworkEvents Header Parsing', () => {
  describe('parseHeaders', () => {
    it('should parse simple string header values', () => {
      const headers = [
        { name: 'Content-Type', value: 'text/html' },
        { name: 'Accept', value: 'application/json' },
      ];

      const result = parseHeaders(headers);

      expect(result['content-type']).toBe('text/html');
      expect(result['accept']).toBe('application/json');
    });

    it('should parse BiDi object header values with type and value', () => {
      // This is how WebDriver BiDi actually returns headers
      const headers = [
        { name: 'Content-Type', value: { type: 'string', value: 'text/html; charset=utf-8' } },
        { name: 'User-Agent', value: { type: 'string', value: 'Mozilla/5.0' } },
        { name: 'Accept', value: { type: 'string', value: 'text/html,application/xhtml+xml' } },
      ];

      const result = parseHeaders(headers);

      expect(result['content-type']).toBe('text/html; charset=utf-8');
      expect(result['user-agent']).toBe('Mozilla/5.0');
      expect(result['accept']).toBe('text/html,application/xhtml+xml');
    });

    it('should NOT return [object Object] for BiDi header values', () => {
      const headers = [{ name: 'Host', value: { type: 'string', value: 'www.example.com' } }];

      const result = parseHeaders(headers);

      expect(result['host']).toBe('www.example.com');
      expect(result['host']).not.toBe('[object Object]');
    });

    it('should handle mixed header value formats', () => {
      const headers = [
        { name: 'Simple', value: 'plain-string' },
        { name: 'BiDi', value: { type: 'string', value: 'bidi-value' } },
      ];

      const result = parseHeaders(headers);

      expect(result['simple']).toBe('plain-string');
      expect(result['bidi']).toBe('bidi-value');
    });

    it('should lowercase header names', () => {
      const headers = [
        { name: 'Content-TYPE', value: 'text/html' },
        { name: 'X-Custom-HEADER', value: { type: 'string', value: 'custom' } },
      ];

      const result = parseHeaders(headers);

      expect(result['content-type']).toBe('text/html');
      expect(result['x-custom-header']).toBe('custom');
    });

    it('should return empty object for non-array input', () => {
      expect(parseHeaders(null as any)).toEqual({});
      expect(parseHeaders(undefined as any)).toEqual({});
      expect(parseHeaders('not-an-array' as any)).toEqual({});
    });

    it('should skip headers without name or with null/undefined value', () => {
      const headers = [
        { name: 'Valid', value: 'value' },
        { name: 'NoValue' },
        { value: 'no-name' },
        { name: 'NullValue', value: null },
        { name: 'UndefinedValue', value: undefined },
        { name: 'Empty', value: '' },
      ];

      const result = parseHeaders(headers);

      expect(result['valid']).toBe('value');
      expect(result['novalue']).toBeUndefined();
      expect(result['nullvalue']).toBeUndefined();
      expect(result['undefinedvalue']).toBeUndefined();
      expect(result['empty']).toBe('');
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should handle BiDi bytes format (binary data)', () => {
      const headers = [{ name: 'X-Binary', value: { type: 'base64', bytes: 'SGVsbG8gV29ybGQ=' } }];

      const result = parseHeaders(headers);

      expect(result['x-binary']).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should handle array values (multi-value headers)', () => {
      const headers = [
        { name: 'Set-Cookie', value: ['cookie1=value1', 'cookie2=value2'] },
        {
          name: 'X-Multi',
          value: [
            { type: 'string', value: 'first' },
            { type: 'string', value: 'second' },
          ],
        },
      ];

      const result = parseHeaders(headers);

      expect(result['set-cookie']).toBe('cookie1=value1, cookie2=value2');
      expect(result['x-multi']).toBe('first, second');
    });

    it('should handle empty array values', () => {
      const headers = [{ name: 'X-Empty-Array', value: [] }];

      const result = parseHeaders(headers);

      expect(result['x-empty-array']).toBeUndefined();
    });

    it('should handle unknown object format with JSON.stringify fallback', () => {
      const headers = [{ name: 'X-Unknown', value: { foo: 'bar', baz: 123 } }];

      const result = parseHeaders(headers);

      expect(result['x-unknown']).toBe('{"foo":"bar","baz":123}');
    });

    it('should handle boolean values', () => {
      const headers = [
        { name: 'X-True', value: true },
        { name: 'X-False', value: false },
      ];

      const result = parseHeaders(headers);

      expect(result['x-true']).toBe('true');
      expect(result['x-false']).toBe('false');
    });

    it('should handle numeric values in BiDi format', () => {
      const headers = [{ name: 'Content-Length', value: { type: 'string', value: 12345 } }];

      const result = parseHeaders(headers);

      expect(result['content-length']).toBe('12345');
    });

    it('should handle empty headers array', () => {
      expect(parseHeaders([])).toEqual({});
    });

    it('should handle numeric values directly', () => {
      const headers = [
        { name: 'Content-Length', value: 1234 },
        { name: 'Age', value: 42 },
      ];

      const result = parseHeaders(headers);

      expect(result['content-length']).toBe('1234');
      expect(result['age']).toBe('42');
    });

    it('should handle array with null and undefined items', () => {
      const headers = [{ name: 'X-Array-Mixed', value: ['valid', null, undefined, 'another', ''] }];

      const result = parseHeaders(headers);

      // Empty strings, null, and undefined are all filtered out (because of !!item check)
      expect(result['x-array-mixed']).toBe('valid, another');
    });

    it('should handle array with only null/undefined items', () => {
      const headers = [{ name: 'X-Array-Null', value: [null, undefined] }];

      const result = parseHeaders(headers);

      expect(result['x-array-null']).toBeUndefined();
    });

    it('should handle nested object with value containing array', () => {
      const headers = [
        {
          name: 'X-Nested',
          value: { value: ['item1', 'item2'] },
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-nested']).toBe('item1, item2');
    });

    it('should handle nested object with bytes containing string', () => {
      const headers = [
        {
          name: 'X-Bytes-Nested',
          value: { bytes: 'base64data' },
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-bytes-nested']).toBe('base64data');
    });

    it('should handle object with circular reference that fails JSON.stringify', () => {
      const circular: any = { foo: 'bar' };
      circular.self = circular; // Create circular reference

      const headers = [{ name: 'X-Circular', value: circular }];

      const result = parseHeaders(headers);

      // Should return null and skip the header
      expect(result['x-circular']).toBeUndefined();
    });

    it('should handle header with null as entire header object', () => {
      const headers = [
        { name: 'Valid', value: 'test' },
        null,
        undefined,
        { name: 'Another', value: 'value' },
      ];

      const result = parseHeaders(headers as any);

      expect(result['valid']).toBe('test');
      expect(result['another']).toBe('value');
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should handle header name that needs string conversion', () => {
      const headers = [
        { name: 123, value: 'numeric-name' },
        { name: true, value: 'boolean-name' },
      ];

      const result = parseHeaders(headers as any);

      expect(result['123']).toBe('numeric-name');
      expect(result['true']).toBe('boolean-name');
    });

    it('should handle object without value or bytes but with other properties', () => {
      const headers = [
        {
          name: 'X-Custom-Object',
          value: { custom: 'property', another: 123, nested: { deep: true } },
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-custom-object']).toBe(
        '{"custom":"property","another":123,"nested":{"deep":true}}'
      );
    });

    it('should handle deeply nested value extraction', () => {
      const headers = [
        {
          name: 'X-Deep',
          value: {
            value: {
              value: 'deeply-nested',
            },
          },
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-deep']).toBe('deeply-nested');
    });

    it('should handle array containing objects with value property', () => {
      const headers = [
        {
          name: 'X-Array-Objects',
          value: [{ value: 'first' }, { value: 'second' }, { value: 'third' }],
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-array-objects']).toBe('first, second, third');
    });

    it('should handle mixed array with primitives and objects', () => {
      const headers = [
        {
          name: 'X-Mixed-Array',
          value: ['plain', { value: 'wrapped' }, 42, true, { bytes: 'binary' }],
        },
      ];

      const result = parseHeaders(headers);

      expect(result['x-mixed-array']).toBe('plain, wrapped, 42, true, binary');
    });

    it('should handle empty string header name', () => {
      const headers = [
        { name: '', value: 'should-be-skipped' },
        { name: '  ', value: 'whitespace-name' },
      ];

      const result = parseHeaders(headers);

      expect(result['']).toBeUndefined();
      expect(result['  ']).toBe('whitespace-name');
    });
  });
});
