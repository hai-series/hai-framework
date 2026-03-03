/// <reference types="@sveltejs/kit" />

/**
 * hai Corporate Website - 类型声明
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
      locale: string
      /** 用户会话 */
      session?: {
        userId: string
        username: string
        roles: string[]
        permissions: string[]
      } | null
    }
  }
}

export {}
