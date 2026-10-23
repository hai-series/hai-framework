/**
 * @h-ai/kit — 浏览器入口
 *
 * 为客户端提供精简且安全的运行时导出，避免将服务端 Hook/A2A/IAM 运行时代码打入浏览器包。
 * @module browser
 */

import { createKitAuthActions } from './client/kit-client-auth.js'
import { createKitClient, installBrowserTransport, installBrowserTransportFetch } from './client/kit-client.js'
import { defineCrud } from './crud/kit-crud.js'
import { clearBrowserToken, setBrowserToken } from './kit-auth.js'
import { KitConfigSchema, resolveKitConfig, resolveKitTransportConfig } from './kit-config.js'
import { setAllModulesLocale } from './kit-i18n.js'

/**
 * 浏览器端 kit 对象（仅暴露 client-safe 能力）
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const client = kit.client.create({ auth: true })
 * client.destroy()
 * ```
 */
export const kit = {
  client: {
    create: createKitClient,
    createAuthActions: createKitAuthActions,
    installBrowserTransport,
    installBrowserTransportFetch,
  },
  crud: {
    define: defineCrud,
  },
  auth: {
    setBrowserToken,
    clearBrowserToken,
  },
  i18n: {
    setLocale: setAllModulesLocale,
  },
}

export { KitConfigSchema, resolveKitConfig, resolveKitTransportConfig }

export type {
  ClientTransportConfig,
  KitClient,
  KitClientConfig,
} from './client/index.js'
export type {
  ApiResponse,
  AuthOperations,
  AuthOperationsProvider,
  CorsConfig,
  FormError,
  FormValidationResult,
  GuardConfig,
  GuardResult,
  HaiRequestEvent,
  HandleA2AConfig,
  HandleA2AOperations,
  HandleAuthConfig,
  HandleConfig,
  HookCryptoConfig,
  KitConfig,
  KitConfigInput,
  KitServerConfig,
  KitServerConfigInput,
  KitTransportConfig,
  KitTransportConfigInput,
  Middleware,
  MiddlewareContext,
  RateLimitConfig,
  RouteGuard,
  SessionData,
  SessionLike,
  TransportEncryptionOptions,
} from './kit-types.js'
