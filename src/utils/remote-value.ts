/**
 * Converts a WebDriver BiDi RemoteValue to a native JavaScript value.
 * Special number values (NaN, Infinity, -0) are returned as strings since
 * they cannot be represented in JSON.
 */
export function remoteValueToNative(rv: unknown): unknown {
  if (!rv || typeof rv !== 'object') {
    return rv;
  }

  const { type, value } = rv as { type: string; value?: unknown };

  switch (type) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (value === 'NaN') {
        return 'NaN';
      }
      if (value === 'Infinity') {
        return 'Infinity';
      }
      if (value === '-Infinity') {
        return '-Infinity';
      }
      if (value === '-0') {
        return '-0';
      }
      return value;
    case 'bigint':
      return `${value as string}n`;
    case 'array':
      return (value as unknown[]).map(remoteValueToNative);
    case 'object':
      return Object.fromEntries(
        (value as [string, unknown][]).map(([k, v]) => [k, remoteValueToNative(v)])
      );
    case 'map':
      return Object.fromEntries(
        (value as [unknown, unknown][]).map(([k, v]) => [
          typeof k === 'object'
            ? JSON.stringify(remoteValueToNative(k))
            : String(k as string | number | boolean),
          remoteValueToNative(v),
        ])
      );
    case 'set':
      return (value as unknown[]).map(remoteValueToNative);
    case 'regexp': {
      const { pattern, flags } = value as { pattern: string; flags?: string };
      return `/${pattern}/${flags ?? ''}`;
    }
    case 'date':
      return value;
    default:
      return `[${type}]`;
  }
}
