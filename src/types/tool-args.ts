/**
 * Argument types derived from a tool's JSON Schema.
 */

import type { FromSchema } from 'json-schema-to-ts';
import type { ToolDefinition } from '../tools/module.js';

/**
 * JSON schema allows additional properties on object types by default,
 * so `FromSchema` adds `[x: string]: unknown` to object types.
 * We want strict validation of tool arguments in our code so we remove this.
 */
type RemoveUnknownProperties<T> = T extends readonly (infer U)[]
  ? RemoveUnknownProperties<U>[]
  : T extends object
    ? {
        [K in keyof T as string extends K
          ? unknown extends T[K]
            ? never
            : K
          : K]: RemoveUnknownProperties<T[K]>;
      }
    : T;

export type ToolArgsOf<D extends ToolDefinition> = RemoveUnknownProperties<
  FromSchema<D['inputSchema']>
>;
