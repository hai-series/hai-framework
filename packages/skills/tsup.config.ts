/**
 * =============================================================================
 * @hai/skills - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    external: ['zod'],
})
