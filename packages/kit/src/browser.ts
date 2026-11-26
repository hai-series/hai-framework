import type { BrowserKitFunctions } from './kit-types.js'
import { createKitAuthActions } from './client/kit-client-auth.js'
/**
 * @h-ai/kit — 浏览器入口
 *
 * 为客户端提供精简且安全的运行时导出，避免将服务端 Hook/A2A/IAM 运行时代码打入浏览器包。
 * @module browser
 */

import { createKitClient, installBrowserTransport, installBrowserTransportFetch } from './client/kit-client.js'
import { defineCrud, resolveOptions, resolveText } from './crud/kit-crud.js'

import { matchPermission } from './guards/kit-permission.js'
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
export const kit: BrowserKitFunctions = {
  resolveConfig: resolveKitConfig,
  resolveTransportConfig: resolveKitTransportConfig,
  guard: { matchPermission },
  client: {
    create: createKitClient,
    createAuthActions: createKitAuthActions,
    installBrowserTransport,
    installBrowserTransportFetch,
  },
  crud: {
    define: defineCrud,
    resolveOptions,
    resolveText,
  },
  auth: {
    setBrowserToken,
    clearBrowserToken,
  },
  i18n: {
    setLocale: setAllModulesLocale,
  },
}

export { KitConfigSchema }

export type {
  ClientTransportConfig,
  KitClient,
  KitClientConfig,
} from './client/index.js'
export type {
  ApiResponse,
  AuthOperations,
  BrowserKitFunctions,
  CorsConfig,
  FormError,
  FormValidationResult,
  GuardConfig,
  GuardResult,
  HaiRequestEvent,
  HandleAuthConfig,
  HandleConfig,
  HookCryptoConfig,
  KitConfig,
  KitConfigInput,
  KitHttpConfig,
  KitHttpConfigInput,
  KitPublicConfig,
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
