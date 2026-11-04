/**
 * Common types shared across the Firefox MCP server
 */

export type McpContentItem =
  | { type: 'text'; text: string; [key: string]: unknown }
  | { type: 'image'; data: string; mimeType: string; [key: string]: unknown };

export interface McpToolResponse {
  [key: string]: unknown;
  content: McpContentItem[];
  isError?: boolean;
}
