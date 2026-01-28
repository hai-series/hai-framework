/**
 * =============================================================================
 * @hai/storage - tsup 配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/local.ts',
    'src/memory.ts',
    'src/manager.ts',
    'src/mime.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['@hai/core', '@hai/config', '@hai/crypto', 'zod'],
})
