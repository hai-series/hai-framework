/**
 * =============================================================================
 * @hai/auth - tsup 配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        session: 'src/session.ts',
        e2ee: 'src/e2ee.ts',
    },
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: 'node20',
    external: ['@hai/core', '@hai/config', '@hai/crypto', '@hai/db'],
})
