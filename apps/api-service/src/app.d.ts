/// <reference types="@sveltejs/kit" />

/**
 * hai API Service - 类型声明
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
    }
  }
}

export {}
