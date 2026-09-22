import { Script } from 'webdriver-bidi-protocol';

export function nativeToLocalValue(value: unknown): Script.LocalValue {
  switch (typeof value) {
    case 'undefined':
      return { type: 'undefined' };
    case 'boolean':
      return { type: 'boolean', value };
    case 'number':
      if (Object.is(value, NaN)) {
        return { type: 'number', value: 'NaN' };
      } else if (Object.is(value, Infinity)) {
        return { type: 'number', value: 'Infinity' };
      } else if (Object.is(value, -Infinity)) {
        return { type: 'number', value: '-Infinity' };
      } else if (Object.is(value, -0)) {
        return { type: 'number', value: '-0' };
      } else {
        return { type: 'number', value };
      }
    case 'string':
      return { type: 'string', value };
    case 'bigint':
      return { type: 'bigint', value: `${value}` };
    case 'object':
      if (value === null) {
        return { type: 'null' };
      } else if (Array.isArray(value)) {
        return { type: 'array', value: value.map(nativeToLocalValue) };
      } else if (value instanceof Set) {
        return { type: 'set', value: [...value].map(nativeToLocalValue) };
      } else if (value instanceof Map) {
        return {
          type: 'map',
          value: [...value.entries()].map((k, v) => [nativeToLocalValue(k), nativeToLocalValue(v)]),
        };
      } else if (value instanceof Date) {
        return { type: 'date', value: value.toISOString() }; //TODO
      } else if (value instanceof RegExp) {
        return { type: 'regexp', value: { pattern: value.source, flags: value.flags } };
      }
      return {
        type: 'object',
        value: Object.entries(value).map(([k, v]) => [k, nativeToLocalValue(v)]),
      };
    default:
      throw new Error(`Can't convert object of type ${typeof value} to remote value.`);
  }
}
