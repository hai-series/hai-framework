/**
 * @h-ai/ui — IAM 场景组件导出
 *
 * 身份认证相关的场景化组件
 * @module index
 */

import { authErrorMessage } from './auth-error-message.js'
import { matchPermission, setPermissionContext, usePermission } from './permission-context.svelte.js'
import { createSensitiveActions } from './sensitive-actions.svelte.js'
import { createSessionRecovery } from './session-recovery.svelte.js'

export { default as AuthPanel } from './AuthPanel.svelte'
// 认证表单
export { default as AuthShell } from './AuthShell.svelte'
export { default as ChangePasswordForm } from './ChangePasswordForm.svelte'
export { default as ForgotPasswordForm } from './ForgotPasswordForm.svelte'
export { default as LoginForm } from './LoginForm.svelte'
export { default as PasswordInput } from './PasswordInput.svelte'
// 权限控制
export { default as PermGuard } from './PermGuard.svelte'

export type { PermissionContext } from './permission-context.svelte.js'

export { default as ReauthenticationDialog } from './ReauthenticationDialog.svelte'
export { default as RegisterForm } from './RegisterForm.svelte'
export { default as ResetPasswordForm } from './ResetPasswordForm.svelte'

export type { SensitiveActions, SensitiveActionsOptions } from './sensitive-actions.svelte.js'
export { default as SensitiveOperationsForm } from './SensitiveOperationsForm.svelte'

export type { SessionRecovery } from './session-recovery.svelte.js'
export { default as SessionRecoveryDialog } from './SessionRecoveryDialog.svelte'
// 用户信息
export { default as UserProfile } from './UserProfile.svelte'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/scenes/iam/index'
 *
 * // 检查给定授权模式是否覆盖指定操作。
 * const allowed = ui.matchPermission('users:read', ['users:*'])
 * void allowed
 * ```
 */
export const ui = {
  authErrorMessage,
  matchPermission,
  setPermissionContext,
  usePermission,
  createSensitiveActions,
  createSessionRecovery,
}
