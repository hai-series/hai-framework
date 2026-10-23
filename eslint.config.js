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

import antfu, { GLOB_SRC } from '@antfu/eslint-config'

export default antfu({
  // unused-imports 使用 TS 规则；JS 使用同一 parser 保持 scope 契约一致。
  typescript: { files: [GLOB_SRC] },

  // 格式化器（CSS/HTML/Markdown）
  formatters: true,

  // 扩展默认忽略（node_modules/dist 等已内置）
  ignores: [
    '**/.svelte-kit/**',
    '**/build/**',
    '**/*.d.ts', // 声明文件（生成产物）不参与 lint
    '**/project.inlang/**', // inlang 工程元数据（工具生成）
    '**/paraglide/**', // Paraglide 自动生成的文件
    '**/src-tauri/gen/**', // Tauri 自动生成的能力与平台 schema
    '**/docs/**/*.md', // 设计/报告文档（示例与伪代码片段）不参与 lint
    'scripts/generated/module-api-inventory.md', // API 清单沿用生成格式，由 check:api 核对快照
    '**/.agents/skills/**/*.md', // 仓库内 AI Skill 文档（示例代码片段）不参与 lint
    '**/packages/cli/templates/skills/**/*.md', // Skill 模板文档（示例代码片段）不参与 lint
    '**/packages/ui/README*.md', // 三语 README 沿用现有 markdown 规则冲突豁免
  ],

  // 启用 Svelte 支持
  svelte: true,
}, {
  // 禁用与 ESLint 10 不兼容的 yaml 规则（eslint-plugin-yml v3 移除了 isSpaceBetweenTokens）
  rules: {
    'yaml/flow-sequence-bracket-spacing': 'off',
  },
}, {
  // 代码质量强制规则 — 这些由 ESLint 自动检测，不依赖 AI 记忆
  files: ['**/*.ts', '**/*.svelte'],
  rules: {
    // 禁止 console（@antfu 默认 warn，提升为 error）
    'no-console': 'error',
    // 禁止 any 类型
    'ts/no-explicit-any': 'error',
  },
}, {
  // 通用 UI 组件库不应耦合 SvelteKit 路由 API
  files: ['packages/ui/**/*.svelte'],
  rules: {
    'svelte/no-navigation-without-resolve': 'off',
  },
})
