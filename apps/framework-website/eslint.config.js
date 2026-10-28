/**
 * ESLint 配置
 *
 * @see https://github.com/antfu/eslint-config
 */

import antfu, { GLOB_SRC } from '@antfu/eslint-config'
import { haiQualityConfig } from './eslint-rules.js'

export default antfu({
  // unused-imports 使用 TS 规则，JS 同样使用 TS parser 以保持 scope 契约一致。
  typescript: { files: [GLOB_SRC] },
  formatters: true,
  ignores: [
    '**/.svelte-kit/**',
    '**/build/**',
    '**/dist/**',
    '**/*.d.ts',
    '**/project.inlang/**',
    '**/paraglide/**',
    '**/.agents/**',
    '**/.claude/**',
    '**/.github/**',
    '**/AGENTS.md',
    '**/CLAUDE.md',
    '**/README.md',
    '**/opencode.json',
    '**/package.json',
    '**/pnpm-workspace.yaml',
  ],
  svelte: true,
}, haiQualityConfig)
