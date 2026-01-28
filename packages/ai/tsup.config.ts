/**
 * =============================================================================
 * @hai/ai - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/adapter.ts',
        'src/stream.ts',
        'src/tools.ts',
    ],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    external: ['zod'],
})
