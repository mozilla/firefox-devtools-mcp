import { readFileSync } from 'fs';
import { defineConfig } from 'tsup';

const { name, version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export const nodeConfig = {
  entry: { index: 'src/index.public.ts' },
  outDir: 'dist',
  format: ['esm'] as const,
  target: 'node20' as const,
  bundle: true,
  minify: false,
  sourcemap: false,
  clean: true,
  dts: false,
  platform: 'node' as const,
  splitting: false,
  external: ['selenium-webdriver'],
  noExternal: ['@modelcontextprotocol/sdk', 'zod', 'dotenv'],
  define: {
    __SERVER_NAME__: JSON.stringify(name),
    __SERVER_VERSION__: JSON.stringify(version),
  },
};

export const browserConfig = {
  entry: { 'snapshot.injected': 'src/firefox/snapshot/injected/snapshot.injected.ts' },
  outDir: 'dist',
  format: ['iife'] as const,
  target: 'es2020' as const,
  bundle: true,
  minify: true,
  sourcemap: false,
  clean: false,
  dts: false,
  platform: 'browser' as const,
  globalName: '__SnapshotInjected',
  onSuccess: 'echo "Build completed successfully!"',
};

export default defineConfig([nodeConfig, browserConfig]);
