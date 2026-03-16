/**
 * =============================================================================
 * hai Agent Framework - ESLint 配置
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
    '**/*.d.ts', // 声明文件（生成产物）不参与 lint
    '**/project.inlang/**', // inlang 工程元数据（工具生成）
    '**/paraglide/**', // Paraglide 自动生成的文件
    '**/.github/skills/**/*.md', // 仓库内 AI Skill 文档（示例代码片段）不参与 lint
    '**/packages/cli/templates/skills/**/*.md', // Skill 模板文档（示例代码片段）不参与 lint
    '**/packages/ui/README.md', // markdown 规则冲突，临时忽略
  ],
}, {
  // 代码质量强制规则 — 这些由 ESLint 自动检测，不依赖 AI 记忆
  files: ['**/*.ts', '**/*.svelte'],
  rules: {
    // 禁止 console（@antfu 默认 warn，提升为 error）
    'no-console': 'error',
    // 禁止 any 类型
    'ts/no-explicit-any': 'error',
  },
})
