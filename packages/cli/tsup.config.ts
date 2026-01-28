/**
 * =============================================================================
 * @hai/cli - tsup 构建配置
 * =============================================================================
 */

import { defineConfig } from 'tsup'

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/types.ts',
        'src/utils.ts',
        'src/commands/index.ts',
        'src/commands/create.ts',
        'src/commands/generate.ts',
    ],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    minify: false,
    target: 'node20',
    external: [
        '@hai/core',
        '@hai/config',
    ],
    banner: {
        js: '#!/usr/bin/env node',
    },
})
