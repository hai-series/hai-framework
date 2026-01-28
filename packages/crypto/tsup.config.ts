/**
 * =============================================================================
 * @hai/crypto - tsup 配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        sm2: 'src/sm2.ts',
        sm3: 'src/sm3.ts',
        sm4: 'src/sm4.ts',
        password: 'src/password.ts',
    },
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: 'node20',
    external: ['@hai/core'],
})
