/**
 * =============================================================================
 * hai Admin Framework - ESLint 配置
 * =============================================================================
 * 使用 @antfu/eslint-config 作为基础配置
 *
 * @see https://github.com/antfu/eslint-config
 * =============================================================================
 */

import antfu from '@antfu/eslint-config'

export default antfu({
    // 启用 TypeScript 支持
    typescript: true,

    // 启用 Svelte 支持
    svelte: true,

    // 格式化器
    formatters: {
        css: true,
        html: true,
        markdown: 'prettier',
    },

    // 忽略文件
    ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.turbo/**',
        '**/.svelte-kit/**',
        '**/coverage/**',
        '**/build/**',
    ],

    // 自定义规则
    rules: {
        // 允许 console（开发时使用 pino 记录日志）
        'no-console': 'warn',

        // TypeScript 规则
        'ts/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'ts/consistent-type-imports': ['error', { prefer: 'type-imports' }],

        // 代码风格
        'style/quotes': ['error', 'single'],
        'style/semi': ['error', 'never'],
        'style/comma-dangle': ['error', 'always-multiline'],

        // Svelte 规则
        'svelte/no-at-html-tags': 'warn',
        'svelte/valid-compile': 'error',
    },
})
