/**
 * =============================================================================
 * Admin Console - 认证相关 Zod 验证 Schema
 * =============================================================================
 *
 * 用于 auth API 路由的请求体验证。
 * 密码最小长度从 IAM 配置读取，保持前后端一致。
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { z } from 'zod'

/**
 * 从 IAM 配置获取密码最小长度，回退到默认值 8。
 */
function getPasswordMinLength(): number {
  return iam.config?.password?.minLength ?? 8
}

/** 登录请求 Schema */
export const LoginSchema = z.object({
  identifier: z.string().min(1, m.api_auth_identifier_password_required()),
  password: z.string().min(1, m.api_auth_identifier_password_required()),
})

/** 注册请求 Schema */
export function createRegisterSchema() {
  const minLen = getPasswordMinLength()
  return z
    .object({
      username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()),
      email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()),
      password: z.string().min(minLen, m.api_auth_password_too_short()),
      confirmPassword: z.string(),
    })
    .refine(d => d.password === d.confirmPassword, {
      message: m.api_auth_password_mismatch(),
      path: ['confirmPassword'],
    })
}

/** 忘记密码请求 Schema */
export const ForgotPasswordSchema = z.object({
  email: z.string().min(1, m.api_auth_email_required()),
})

/** 重置密码请求 Schema */
export function createResetPasswordSchema() {
  const minLen = getPasswordMinLength()
  return z
    .object({
      token: z.string().min(1, m.api_common_required_fields()),
      password: z.string().min(minLen, m.api_auth_password_too_short()),
      confirmPassword: z.string(),
    })
    .refine(d => d.password === d.confirmPassword, {
      message: m.api_auth_password_mismatch(),
      path: ['confirmPassword'],
    })
}
