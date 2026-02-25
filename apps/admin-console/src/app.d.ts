/// <reference types="@sveltejs/kit" />

import '@h-ai/ui/auto-import'

/**
 * hai Admin Console - 类型声明
 */

declare global {
  namespace App {
    interface Error {
      code?: string
      message: string
    }

    interface Locals {
      /** 请求 ID */
      requestId: string
      /** 用户会话 */
      session?: {
        userId: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
        permissions: string[]
      }
      /** 当前语言 */
      locale?: string
    }

    interface PageData {
      /** 用户信息 */
      user?: {
        id: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
      }
    }

    // interface PageState {}
    // interface Platform {}
  }
}

export { }
