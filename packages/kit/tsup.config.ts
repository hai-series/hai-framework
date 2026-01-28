/**
 * =============================================================================
 * @hai/kit - tsup 配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/hooks/index.ts',
    'src/middleware/index.ts',
    'src/guards/index.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['@sveltejs/kit', '@hai/core', '@hai/config', '@hai/auth'],
})
