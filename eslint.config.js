/**
 * =============================================================================
 * hai Admin Framework - ESLint 配置
 * =============================================================================
 * 使用 @antfu/eslint-config 作为基础配置
 * TypeScript 和 Svelte 会自动检测，无需显式启用
 *
 * @see https://github.com/antfu/eslint-config
 * =============================================================================
 */

import antfu from '@antfu/eslint-config'

export default antfu({
  // 格式化器（CSS/HTML/Markdown）
  formatters: true,

  // 扩展默认忽略（node_modules/dist 等已内置）
  ignores: [
    '**/.svelte-kit/**',
    '**/build/**',
    '**/paraglide/**', // Paraglide 自动生成的文件
  ],
})
