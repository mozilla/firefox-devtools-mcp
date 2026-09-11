#!/usr/bin/env node

// Load .env file in development mode
if (process.env.NODE_ENV !== 'production') {
  try {
    const { config } = await import('dotenv');
    const result = config();
    if (result.parsed) {
      console.error('Loaded .env file for development');
    }
  } catch {
    // dotenv not required in production
  }
}

// Public entry point: the deprecated --enable-privileged-context selector is
// excluded from the CLI. Privileged access requires --allow-system-access.
import { parseArguments } from './cli.js';
import { run } from './index.js';

export { FirefoxDevTools } from './firefox/index.js';
export { FirefoxDisconnectedError, isDisconnectionError } from './utils/errors.js';

run((v) => parseArguments(v, process.argv, false), import.meta.url).catch((error) => {
  console.error('Fatal error in main', error);
  process.exit(1);
});
