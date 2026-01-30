/**
 * =============================================================================
 * @hai/ui - IAM 场景组件导出
 * =============================================================================
 * 身份认证相关的场景化组件
 *
 * 包含：
 * - LoginForm - 登录表单
 * - RegisterForm - 注册表单
 * - PasswordInput - 密码输入框
 * - ChangePasswordForm - 修改密码表单
 * - ForgotPasswordForm - 找回密码表单
 * - ResetPasswordForm - 重置密码表单
 * - UserProfile - 用户个人信息
 * =============================================================================
 */

export { default as ChangePasswordForm } from './ChangePasswordForm.svelte'
export { default as ForgotPasswordForm } from './ForgotPasswordForm.svelte'
// 认证表单
export { default as LoginForm } from './LoginForm.svelte'
export { default as PasswordInput } from './PasswordInput.svelte'
export { default as RegisterForm } from './RegisterForm.svelte'
export { default as ResetPasswordForm } from './ResetPasswordForm.svelte'

// 用户信息
export { default as UserProfile } from './UserProfile.svelte'
