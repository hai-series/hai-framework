/**
 * @h-ai/ui — IAM 场景组件导出
 *
 * 身份认证相关的场景化组件
 * @module index
 */

export { default as ChangePasswordForm } from './ChangePasswordForm.svelte'
export { default as ForgotPasswordForm } from './ForgotPasswordForm.svelte'
// 认证表单
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

export { default as RegisterForm } from './RegisterForm.svelte'
export { default as ResetPasswordForm } from './ResetPasswordForm.svelte'
// 用户信息
export { default as UserProfile } from './UserProfile.svelte'
