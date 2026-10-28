import type { IamLoginInput, IamRegisterInput, IamUpdateCurrentUserInput } from '@h-ai/api-contract'
import { HaiErrorSchema } from '@h-ai/api-contract'
import { authErrorMessage } from '@h-ai/ui/i18n'
import { mobileApiClient } from '../api.js'
import * as m from '../paraglide/messages.js'

type LoginSuccessResult = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.auth.login>>,
  { success: true }
>

type RegisterSuccessResult = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.auth.register>>,
  { success: true }
>

export type IamUser = LoginSuccessResult['data']['user']

let user = $state<IamUser | null>(null)
let loading = $state(false)
let initialized = $state(false)
let roles = $state<string[]>([])
let permissions = $state<string[]>([])

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

  const error = HaiErrorSchema.safeParse(maybeResult.error)
  return { success: false, message: error.success ? authErrorMessage(error.data) : fallback }
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

export function currentUser(): IamUser | null {
  return user
}

export function isAuthenticated(): boolean {
  return user !== null
}

export function isLoading(): boolean {
  return loading
}

export function isInitialized(): boolean {
  return initialized
}

export function currentRoles(): string[] {
  return roles
}

export function currentPermissions(): string[] {
  return permissions
}

export function hasPermission(permission: string): boolean {
  return permissions.some(granted => matchesPermission(permission, granted))
}

/** 保存失败后清理可能已经写入的半对凭据；清理失败单独提示，不能伪装成持久删除成功。 */
async function clearFailedAuthentication(): Promise<string> {
  user = null
  clearAccessScope()
  try {
    await mobileApiClient.auth.clear()
    return m.auth_storage_failed()
  }
  catch {
    return m.auth_storage_cleanup_failed()
  }
}

export async function login(input: IamLoginInput): Promise<string | null> {
  loading = true
  try {
    const result = await mobileApiClient.iam.auth.login(input)
    const failure = resolveHaiResultFailure(result, m.common_unknown_error())
    if (!failure.success)
      return failure.message
    if (!isSuccessResult<LoginSuccessResult['data']>(result))
      return m.common_unknown_error()

    await mobileApiClient.auth.setTokens(result.data.tokens)
    user = result.data.user
    setAccessScope(result.data.roles, result.data.permissions)
    return null
  }
  catch {
    return await clearFailedAuthentication()
  }
  finally {
    loading = false
  }
}

export async function register(input: IamRegisterInput): Promise<string | null> {
  loading = true
  try {
    const result = await mobileApiClient.iam.auth.register(input)
    const failure = resolveHaiResultFailure(result, m.common_unknown_error())
    if (!failure.success)
      return failure.message
    if (!isSuccessResult<RegisterSuccessResult['data']>(result))
      return m.common_unknown_error()

    await mobileApiClient.auth.setTokens(result.data.tokens)
    user = result.data.user
    setAccessScope(result.data.roles, result.data.permissions)
    return null
  }
  catch {
    return await clearFailedAuthentication()
  }
  finally {
    loading = false
  }
}

export async function logout(): Promise<void> {
  loading = true
  try {
    const result = await mobileApiClient.iam.auth.logout({})
    const failure = resolveHaiResultFailure(result, m.common_unknown_error())
    if (!failure.success)
      throw new Error(failure.message)
  }
  finally {
    // 服务端退出失败时仍屏蔽并清理本地凭据；删除失败交由界面明确提示。
    try {
      await mobileApiClient.auth.clear()
    }
    finally {
      user = null
      clearAccessScope()
      loading = false
    }
  }
}

export async function updateProfile(input: IamUpdateCurrentUserInput): Promise<string | null> {
  loading = true
  const result = await mobileApiClient.iam.auth.updateCurrentUser(input)
  const failure = resolveHaiResultFailure(result, 'Unexpected profile response from server')
  if (!failure.success) {
    loading = false
    return failure.message
  }

  if (!isSuccessResult<IamUser>(result)) {
    loading = false
    return 'Unexpected profile response from server'
  }

  user = result.data
  loading = false
  return null
}

export async function refreshCurrentUser(): Promise<void> {
  loading = true
  const result = await mobileApiClient.iam.auth.currentUser()
  if (result.success) {
    const { roles: nextRoles, permissions: nextPermissions, ...currentUser } = result.data
    user = currentUser
    setAccessScope(nextRoles, nextPermissions)
  }
  else {
    user = null
    clearAccessScope()
  }
  loading = false
  initialized = true
}
