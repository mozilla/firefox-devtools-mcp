/**
 * Configuration constants for Firefox DevTools MCP server
 */

// Injected at build time by esbuild define
declare const __SERVER_NAME__: string | undefined;
declare const __SERVER_VERSION__: string | undefined;

export const SERVER_NAME =
  typeof __SERVER_NAME__ !== 'undefined' ? __SERVER_NAME__ : 'firefox-devtools';
export const SERVER_VERSION =
  typeof __SERVER_VERSION__ !== 'undefined' ? __SERVER_VERSION__ : 'dev';
