/**
 * =============================================================================
 * @hai/db - tsup 配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        schema: 'src/schema.ts',
        migrate: 'src/migrate.ts',
    },
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: 'node20',
    external: ['@hai/core', '@hai/config', 'better-sqlite3', 'postgres', 'mysql2'],
})
