/**
 * @h-ai/kit — 浏览器入口
 *
 * 为客户端提供精简且安全的运行时导出，避免将服务端 Hook/A2A/IAM 运行时代码打入浏览器包。
 * @module browser
 */

import { createKitClient } from './client/kit-client.js'
import { clearBrowserToken, createHandleFetch, createTokenStore, setBrowserToken } from './kit-auth.js'
import { setAllModulesLocale } from './kit-i18n.js'

/**
 * 浏览器端 kit 对象（仅暴露 client-safe 能力）
 */
export const kit = {
  client: {
    create: createKitClient,
  },
  auth: {
    setBrowserToken,
    clearBrowserToken,
    createTokenStore,
    createHandleFetch,
  },
  i18n: {
    setLocale: setAllModulesLocale,
  },
}

export type * from './client/index.js'
export type * from './kit-types.js'
