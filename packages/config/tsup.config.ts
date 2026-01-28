/**
 * =============================================================================
 * @hai/config - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/schemas/index.ts',
    ],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['@hai/core'],
})
