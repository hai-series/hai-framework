/**
 * =============================================================================
 * @hai/kit - IAM 模块导出
 * =============================================================================
 * SvelteKit 与 @hai/iam 集成
 *
 * 包含：
 * - createIamHandle - Handle Hook
 * - createIamActions - Form Actions
 * - requireAuth / requireRole / requirePermission - 路由守卫
 * =============================================================================
 */

// Form Actions
export { createIamActions } from './iam-actions.js'

// Handle Hook
export { createIamHandle, requireAuth, requirePermission, requireRole } from './iam-handle.js'

// 类型
export type {
  IamActionResult,
  IamActionsConfig,
  IamHandleConfig,
  IamLocals,
  IamServiceLike,
  SessionData,
  UserData,
} from './iam-types.js'
