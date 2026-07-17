/// <reference types="@sveltejs/kit" />

// SvelteKit 全局类型声明：错误结构与请求级 Locals（requestId、locale）
import '@h-ai/ui/auto-import'

declare global {
  namespace App {
    interface Error {
      code?: string
      message: string
    }

    interface Locals {
      requestId: string
      locale: string
    }
  }
}

export {}
