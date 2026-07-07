import { defineConfig } from 'tsup';
import { browserConfig, nodeConfig } from './tsup.config';

export default defineConfig([
  { ...nodeConfig, entry: { index: 'src/index.moz.ts' }, outDir: 'dist.moz' },
  { ...browserConfig, outDir: 'dist.moz', onSuccess: 'echo "Moz build completed successfully!"' },
]);
