/// <reference types="@sveltejs/kit" />

import '@h-ai/ui/auto-import'

/**
 * hai H5 App - 类型声明
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
      /** 当前语言 */
      locale?: string
      /** 用户会话 */
      session?: {
        userId: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
        permissions: string[]
      } | null
    }
  }
}

export {}
