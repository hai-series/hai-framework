/**
 * @h-ai/ui — IAM 场景组件导出
 *
 * 身份认证相关的场景化组件
 * @module index
 */

export { default as AuthPanel } from './AuthPanel.svelte'
// 认证表单
export { default as AuthShell } from './AuthShell.svelte'
export { default as ChangePasswordForm } from './ChangePasswordForm.svelte'
export { default as ForgotPasswordForm } from './ForgotPasswordForm.svelte'
export { default as LoginForm } from './LoginForm.svelte'
export { default as PasswordInput } from './PasswordInput.svelte'
// 权限控制
export { default as PermGuard } from './PermGuard.svelte'
export {
  matchPermission,
  setPermissionContext,
  usePermission,
} from './permission-context.svelte.js'

export type { PermissionContext } from './permission-context.svelte.js'

export { default as ReauthenticationDialog } from './ReauthenticationDialog.svelte'
export { default as RegisterForm } from './RegisterForm.svelte'
export { default as ResetPasswordForm } from './ResetPasswordForm.svelte'
export { createSensitiveActions } from './sensitive-actions.svelte.js'
export type { SensitiveActions, SensitiveActionsOptions } from './sensitive-actions.svelte.js'
export { default as SensitiveOperationsForm } from './SensitiveOperationsForm.svelte'
export { createSessionRecovery } from './session-recovery.svelte.js'
export type { SessionRecovery } from './session-recovery.svelte.js'
export { default as SessionRecoveryDialog } from './SessionRecoveryDialog.svelte'
// 用户信息
export { default as UserProfile } from './UserProfile.svelte'
