/**
 * Configuration constants for Firefox DevTools MCP server
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export const SERVER_NAME = 'firefox-devtools';
export const SERVER_VERSION = pkg.version;
