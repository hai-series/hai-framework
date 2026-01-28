/**
 * =============================================================================
 * @hai/mcp - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server.ts',
    'src/client.ts',
    'src/types.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['zod'],
})
