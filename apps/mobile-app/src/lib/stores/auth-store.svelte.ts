import type { IamLoginInput, IamRegisterInput, IamUpdateCurrentUserInput } from '@h-ai/api-contract'
import { mobileApiClient } from '../api.js'

export type IamUser = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.auth.currentUser>>,
  { success: true }
>['data']

type LoginSuccessResult = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.auth.login>>,
  { success: true }
>

type RegisterSuccessResult = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.auth.register>>,
  { success: true }
>

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

export async function login(input: IamLoginInput): Promise<string | null> {
  loading = true
  const result = await mobileApiClient.iam.auth.login(input)
  const failure = resolveHaiResultFailure(result, 'Unexpected login response from server')
  if (!failure.success) {
    loading = false
    return failure.message
  }

  if (!isSuccessResult<LoginSuccessResult['data']>(result)) {
    loading = false
    return 'Unexpected login response from server'
  }

  await mobileApiClient.auth.setTokens(result.data.tokens)
  user = result.data.user
  setAccessScope(result.data.roles, result.data.permissions)
  loading = false
  return null
}

export async function register(input: IamRegisterInput): Promise<string | null> {
  loading = true
  const result = await mobileApiClient.iam.auth.register(input)
  const failure = resolveHaiResultFailure(result, 'Unexpected register response from server')
  if (!failure.success) {
    loading = false
    return failure.message
  }

  if (!isSuccessResult<RegisterSuccessResult['data']>(result)) {
    loading = false
    return 'Unexpected register response from server'
  }

  await mobileApiClient.auth.setTokens(result.data.tokens)
  user = result.data.user
  setAccessScope(result.data.roles, result.data.permissions)
  loading = false
  return null
}

export async function logout(): Promise<void> {
  loading = true
  await mobileApiClient.iam.auth.logout({})
  await mobileApiClient.auth.clear()
  user = null
  clearAccessScope()
  loading = false
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
    user = result.data
  }
  else {
    user = null
    clearAccessScope()
  }
  loading = false
  initialized = true
}
