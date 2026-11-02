/**
 * Tool module primitives.
 *
 * Each tool source file declares its own module with `defineModule`, co-locating
 * the module metadata with the tool definitions and handlers it contains. The
 * registry collects these module objects; it does not repeat the tool list.
 */

import type { McpToolResponse } from '../types/common.js';
import type { ToolArgsOf } from '../types/tool-args.js';
import { errorResponse } from '../utils/response-helpers.js';

export type JsonSchemaType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';

export interface JsonSchemaProperty {
  type: JsonSchemaType | readonly JsonSchemaType[];
  description?: string;
  enum?: readonly string[];
  /** Schema of array elements (when type is 'array'). */
  items?: JsonSchemaProperty;
  /** Schema for values of an open-key object (prefs-style maps). */
  additionalProperties?: { oneOf: Array<{ type: JsonSchemaType }> };
  properties?: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
}

export interface InputSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  annotations?: { readOnlyHint?: boolean; [key: string]: unknown };
  inputSchema: InputSchema;
}

export type ToolHandler = (input: unknown) => Promise<McpToolResponse>;

/** A handler as returned by `defineToolHandler`, typed by its tool definition. */
export type TypedToolHandler<D extends ToolDefinition> = (
  args?: ToolArgsOf<D>
) => Promise<McpToolResponse>;

export interface ToolEntry<D extends ToolDefinition = ToolDefinition> {
  definition: D;
  handler: ToolHandler;
}

/** Definition/handler pairs as they are written in a module config. */
type ToolPairs = readonly (readonly [ToolDefinition, (args: never) => Promise<McpToolResponse>])[];

/** The entries a module config's pairs turn into, definition types kept. */
type EntriesOf<T extends ToolPairs> = { -readonly [I in keyof T]: ToolEntry<T[I][0]> };

/**
 * A group of related tools that can be enabled or disabled as a unit.
 * `privileged` modules require the moz build and MOZ_REMOTE_ALLOW_SYSTEM_ACCESS
 * at runtime; `mozOnly` modules only require the moz build. Both are dropped
 * entirely when the server is not allowed to expose them (see buildToolset).
 */
export interface ToolModule<T extends readonly ToolEntry[] = readonly ToolEntry[]> {
  name: string;
  description: string;
  privileged?: boolean;
  mozOnly?: boolean;
  tools: T;
}

export interface ModuleConfig<T extends ToolPairs = ToolPairs> {
  name: string;
  description: string;
  privileged?: boolean;
  mozOnly?: boolean;
  /** Each entry pairs a tool definition with its handler. */
  tools: T;
}

/** Improve the error message shown when `as const` is missing from a tool definition. */
type RequireConst<D extends ToolDefinition> = string extends D['name']
  ? { 'Add `as const` before `satisfies ToolDefinition` in the tool definition': true }
  : unknown;

/**
 * Wrap a tool handler so thrown errors become MCP error responses.
 *
 * The tool definition is passed as a type argument to derive the argument type
 * of the handler from its input schema.
 */
export function defineToolHandler<D extends ToolDefinition & RequireConst<D>>(
  handler: (args: ToolArgsOf<D>) => Promise<McpToolResponse>
): TypedToolHandler<D>;
export function defineToolHandler(
  handler: (args: unknown) => Promise<McpToolResponse>
): ToolHandler {
  return async (input: unknown): Promise<McpToolResponse> => {
    const args: unknown = input ?? {};
    try {
      return await handler(args);
    } catch (error) {
      return errorResponse(error instanceof Error ? error : String(error));
    }
  };
}

export function defineModule<const T extends ToolPairs>(
  config: ModuleConfig<T>
): ToolModule<EntriesOf<T>> {
  return {
    name: config.name,
    description: config.description,
    ...(config.privileged ? { privileged: true } : {}),
    ...(config.mozOnly ? { mozOnly: true } : {}),
    tools: config.tools.map(([definition, handler]) => ({
      definition,
      handler,
    })) as EntriesOf<T>,
  };
}
