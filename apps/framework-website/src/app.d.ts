/// <reference types="@sveltejs/kit" />
import '@h-ai/ui/auto-import'
declare global {
  namespace App {
    interface PageData {
      /** 经服务端 core 解析后可公开的应用配置 */
      appConfig: Pick<import('@h-ai/core').CoreConfig, 'name' | 'version' | 'env' | 'defaultLocale'>
    }
    interface Locals {
      /** 请求 ID */
      requestId: string
      /** 语言 */
      locale: string
    }
  }
}

export {}
