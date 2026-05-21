/**
 * @file src/lib/auth-store.svelte.ts
 *
 * Runes-based 认证状态：封装登录 / 注册 / 登出 / 拉取当前用户，
 * 统一处理 `HaiResult` 失败并对外暴露 `currentUser` / `isAuthenticated` / `loading` 三个响应式查询。
 */

import type { IamLoginInput, IamRegisterInput } from '@h-ai/api-contract'
import { api } from '@h-ai/api-client'

export type IamUser = Extract<
  Awaited<ReturnType<typeof api.iam.auth.currentUser>>,
  { success: true }
>['data']

let user = $state<IamUser | null>(null)
let loading = $state(false)
let initialized = $state(false)

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

/**
 * 用密码登录。
 *
 * @returns 错误码（成功为 null）；可用于 UI 直接展示错误。
 */
export async function login(input: IamLoginInput): Promise<string | null> {
  loading = true
  try {
    const result = await api.iam.auth.login(input)
    if (!result.success) {
      return String(result.error.code) ?? 'unknown'
    }
    user = result.data.user
    return null
  }
  finally {
    loading = false
  }
}

/** 注册并自动登录。 */
export async function register(input: IamRegisterInput): Promise<string | null> {
  loading = true
  try {
    const result = await api.iam.auth.register(input)
    if (!result.success) {
      return String(result.error.code) ?? 'unknown'
    }
    user = result.data.user
    return null
  }
  finally {
    loading = false
  }
}

/** 登出当前会话；服务端失败也清除本地状态。 */
export async function logout(): Promise<void> {
  loading = true
  try {
    await api.iam.auth.logout({})
  }
  finally {
    user = null
    loading = false
  }
}

/** 拉取当前用户；用于应用启动时尝试自动登录。 */
export async function refreshCurrentUser(): Promise<void> {
  loading = true
  try {
    const result = await api.iam.auth.currentUser()
    user = result.success ? result.data : null
  }
  finally {
    loading = false
    initialized = true
  }
}
