/// <reference types="@sveltejs/kit" />

import '@h-ai/ui/auto-import'

/**
 * hai Mobile App - 类型声明
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
    }

    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

declare module '*.css'

export {}
