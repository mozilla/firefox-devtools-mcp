import { defineConfig } from 'tsup';

export default defineConfig([
  // Moz build (includes --enable-privileged-context)
  {
    entry: { index: 'src/index.moz.ts' },
    outDir: 'dist.moz',
    format: ['esm'],
    target: 'node20',
    bundle: true,
    minify: false,
    sourcemap: false,
    clean: true,
    dts: false,
    platform: 'node',
    splitting: false,
    external: ['selenium-webdriver'],
    noExternal: ['@modelcontextprotocol/sdk', 'zod', 'dotenv'],
  },
  // Injected snapshot script (browser context)
  {
    entry: {
      'snapshot.injected': 'src/firefox/snapshot/injected/snapshot.injected.ts',
    },
    outDir: 'dist.moz',
    format: ['iife'],
    target: 'es2020',
    bundle: true,
    minify: true,
    sourcemap: false,
    clean: false,
    dts: false,
    platform: 'browser',
    globalName: '__SnapshotInjected',
    onSuccess: 'echo "Moz build completed successfully!"',
  },
]);
