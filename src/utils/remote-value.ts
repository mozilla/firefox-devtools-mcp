import type { Script } from 'webdriver-bidi-protocol';

/**
 * Converts a WebDriver BiDi RemoteValue to a native JavaScript value.
 * Special number values (NaN, Infinity, -0) are returned as strings since
 * they cannot be represented in JSON.
 */
export function remoteValueToNative(rv: Script.RemoteValue): unknown {
  if (!rv || typeof rv !== 'object') {
    return rv;
  }

  switch (rv.type) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'string':
    case 'boolean':
      return rv.value;
    case 'number':
      if (rv.value === 'NaN') {
        return 'NaN';
      }
      if (rv.value === 'Infinity') {
        return 'Infinity';
      }
      if (rv.value === '-Infinity') {
        return '-Infinity';
      }
      if (rv.value === '-0') {
        return '-0';
      }
      return rv.value;
    case 'bigint':
      return `${rv.value}n`;
    case 'array':
      return (rv.value ?? []).map(remoteValueToNative);
    case 'object':
      return Object.fromEntries((rv.value ?? []).map(([k, v]) => [k, remoteValueToNative(v)]));
    case 'map':
      return Object.fromEntries(
        (rv.value ?? []).map(([k, v]) => [
          typeof k === 'object'
            ? JSON.stringify(remoteValueToNative(k))
            : String(k as string | number | boolean),
          remoteValueToNative(v),
        ])
      );
    case 'set':
      return (rv.value ?? []).map(remoteValueToNative);
    case 'regexp': {
      const { pattern, flags } = rv.value;
      return `/${pattern}/${flags ?? ''}`;
    }
    case 'date':
      return rv.value;
    default:
      return `[${rv.type}]`;
  }
}
