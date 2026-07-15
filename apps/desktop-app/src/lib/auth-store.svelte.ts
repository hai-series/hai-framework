/**
 * @file src/lib/auth-store.svelte.ts
 *
 * Runes-based 认证状态：封装登录 / 注册 / 登出 / 拉取当前用户，
 * 统一处理 `HaiResult` 失败并对外暴露 `currentUser` / `isAuthenticated` / `loading` 三个响应式查询。
 */

import type { IamLoginInput, IamRegisterInput } from '@h-ai/api-contract'
import { desktopApiClient } from './api.js'

type LoginSuccessResult = Extract<
  Awaited<ReturnType<typeof desktopApiClient.iam.auth.login>>,
  { success: true }
>

type RegisterSuccessResult = Extract<
  Awaited<ReturnType<typeof desktopApiClient.iam.auth.register>>,
  { success: true }
>

export type IamUser = LoginSuccessResult['data']['user']

let user = $state<IamUser | null>(null)
let loading = $state(false)
let initialized = $state(false)
let roles = $state<string[]>([])
let permissions = $state<string[]>([])

function resolveRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim())
    return error
  return fallback
}

function resolveHaiResultFailure(
  result: unknown,
  fallback: string,
): { success: true } | { success: false, message: string } {
  if (!result || typeof result !== 'object')
    return { success: false, message: fallback }

  const maybeResult = result as {
    success?: unknown
    error?: {
      code?: unknown
      message?: unknown
    }
  }

  if (maybeResult.success === true)
    return { success: true }

  if (maybeResult.success !== false)
    return { success: false, message: fallback }

  if (typeof maybeResult.error?.message === 'string' && maybeResult.error.message.trim())
    return { success: false, message: maybeResult.error.message }

  if (maybeResult.error?.code !== undefined)
    return { success: false, message: String(maybeResult.error.code) }

  return { success: false, message: fallback }
}

function isSuccessResult<TData>(result: unknown): result is { success: true, data: TData } {
  if (!result || typeof result !== 'object')
    return false

  const maybeResult = result as { success?: unknown, data?: unknown }
  return maybeResult.success === true && 'data' in maybeResult
}

function setAccessScope(nextRoles: readonly string[], nextPermissions: readonly string[]): void {
  roles = [...nextRoles]
  permissions = [...nextPermissions]
}

function clearAccessScope(): void {
  roles = []
  permissions = []
}

function matchesPermission(required: string, granted: string): boolean {
  if (granted === '*' || granted === required)
    return true
  if (!granted.endsWith(':*'))
    return false
  return required.startsWith(granted.slice(0, -1))
}

/** 当前已登录用户（未登录则为 `null`）。响应式。 */
export function currentUser(): IamUser | null {
  return user
}

/** 是否已登录。响应式。 */
export function isAuthenticated(): boolean {
  return user !== null
}

/** 是否正在进行认证请求。响应式。 */
export function isLoading(): boolean {
  return loading
}

/** 是否已尝试过自动登录（初次拉取 currentUser）。 */
export function isInitialized(): boolean {
  return initialized
}

/** 当前角色代码列表。响应式。 */
export function currentRoles(): string[] {
  return roles
}

/** 当前权限代码列表。响应式。 */
export function currentPermissions(): string[] {
  return permissions
}

/** 是否拥有指定权限（支持 `*` / `user:*` 通配符）。 */
export function hasPermission(permission: string): boolean {
  return permissions.some(granted => matchesPermission(permission, granted))
}

/**
 * 用密码登录。
 *
 * @returns 错误码（成功为 null）；可用于 UI 直接展示错误。
 */
export async function login(input: IamLoginInput): Promise<string | null> {
  loading = true
  try {
    const result = await desktopApiClient.iam.auth.login(input)
    const failure = resolveHaiResultFailure(result, 'Unexpected login response from server')
    if (!failure.success)
      return failure.message

    if (!isSuccessResult<LoginSuccessResult['data']>(result))
      return 'Unexpected login response from server'

    const nextRoles = Array.isArray(result.data.roles) ? result.data.roles : []
    const nextPermissions = Array.isArray(result.data.permissions) ? result.data.permissions : []
    await desktopApiClient.auth.setTokens(result.data.tokens)
    user = result.data.user
    setAccessScope(nextRoles, nextPermissions)
    return null
  }
  catch (error) {
    return resolveRequestErrorMessage(error, 'Login request failed')
  }
  finally {
    loading = false
  }
}

/** 注册并自动登录。 */
export async function register(input: IamRegisterInput): Promise<string | null> {
  loading = true
  try {
    const result = await desktopApiClient.iam.auth.register(input)
    const failure = resolveHaiResultFailure(result, 'Unexpected register response from server')
    if (!failure.success)
      return failure.message

    if (!isSuccessResult<RegisterSuccessResult['data']>(result))
      return 'Unexpected register response from server'

    const nextRoles = Array.isArray(result.data.roles) ? result.data.roles : []
    const nextPermissions = Array.isArray(result.data.permissions) ? result.data.permissions : []
    await desktopApiClient.auth.setTokens(result.data.tokens)
    user = result.data.user
    setAccessScope(nextRoles, nextPermissions)
    return null
  }
  catch (error) {
    return resolveRequestErrorMessage(error, 'Register request failed')
  }
  finally {
    loading = false
  }
}

/** 登出当前会话；服务端失败也清除本地状态。 */
export async function logout(): Promise<void> {
  loading = true
  try {
    await desktopApiClient.iam.auth.logout({})
  }
  catch {
    // 服务端登出失败时仍然清理本地凭证，避免把用户卡在坏会话里。
  }
  finally {
    await desktopApiClient.auth.clear()
    user = null
    clearAccessScope()
    loading = false
  }
}

/** 拉取当前用户与服务端重新校验后的角色/权限。 */
export async function refreshCurrentUser(): Promise<void> {
  loading = true
  try {
    const result = await desktopApiClient.iam.auth.currentUser()
    if (result.success) {
      const { roles: nextRoles, permissions: nextPermissions, ...currentUser } = result.data
      user = currentUser
      setAccessScope(nextRoles, nextPermissions)
    }
    else {
      user = null
      clearAccessScope()
    }
  }
  catch {
    user = null
    clearAccessScope()
  }
  finally {
    loading = false
    initialized = true
  }
}
