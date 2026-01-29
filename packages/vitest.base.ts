/**
 * =============================================================================
 * 共享 vitest 配置
 * =============================================================================
 */

import { defineConfig } from 'vitest/config'

export const baseTestConfig = defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/index.ts'],
        },
    },
})
