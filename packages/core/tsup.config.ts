/**
 * =============================================================================
 * @hai/core - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/result.ts',
        'src/error.ts',
        'src/di.ts',
        'src/logger.ts',
        'src/utils.ts',
    ],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['pino', 'pino-pretty'],
})
