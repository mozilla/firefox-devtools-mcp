/**
 * Tool module primitives.
 *
 * Each tool source file declares its own module with `defineModule`, co-locating
 * the module metadata with the tool definitions and handlers it contains. The
 * registry collects these module objects; it does not repeat the tool list.
 */

import type { McpToolResponse } from '../types/common.js';
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

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * A group of related tools that can be enabled or disabled as a unit.
 * `privileged` modules require MCP startup consent; they are dropped entirely
 * when the server is not allowed to expose privileged tools (see buildToolset).
 */
export interface ToolModule {
  name: string;
  description: string;
  privileged?: boolean;
  tools: ToolEntry[];
}

export interface ModuleConfig {
  name: string;
  description: string;
  privileged?: boolean;
  /** Each entry pairs a tool definition with its handler. */
  tools: Array<[ToolDefinition, ToolHandler]>;
}

export function defineToolHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<McpToolResponse>
): (...args: TArgs) => Promise<McpToolResponse> {
  return async (...args: TArgs): Promise<McpToolResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error instanceof Error ? error : String(error));
    }
  };
}

export function defineModule(config: ModuleConfig): ToolModule {
  return {
    name: config.name,
    description: config.description,
    ...(config.privileged ? { privileged: true } : {}),
    tools: config.tools.map(([definition, handler]) => ({ definition, handler })),
  };
}
