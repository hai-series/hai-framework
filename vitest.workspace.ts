/**
 * =============================================================================
 * hai Admin Framework - Vitest Workspace 配置
 * =============================================================================
 * 定义 Monorepo 测试工作区
 *
 * @see https://vitest.dev/guide/workspace
 * =============================================================================
 */

import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // 核心包测试
  'packages/*/vitest.config.ts',
  // 应用测试
  'apps/*/vitest.config.ts',
])
