/**
 * =============================================================================
 * @hai/kit - 主入口
 * =============================================================================
 * SvelteKit 集成模块，提供:
 * - Handle hook
 * - 中间件
 * - 路由守卫
 * - API 响应工具
 * - 表单验证
 * - 模块集成（IAM/Storage/Cache/Crypto）
 * - 客户端 Store
 * =============================================================================
 */

// i18n - 从 @hai/core 导入
import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

export {
  useIsAuthenticated,
  useSession,
  useUpload,
  useUser,
} from './client/index.js'

export type {
  ClientUser,
  SessionState,
  SessionStore,
  UploadFile,
  UploadOptions,
  UploadState,
  UploadStore,
  UseSessionOptions,
  UseUploadOptions,
} from './client/index.js'

export {
  allGuards,
  anyGuard,
  authGuard,
  type AuthGuardConfig,
  conditionalGuard,
  notGuard,
  permissionGuard,
  type PermissionGuardConfig,
  roleGuard,
  type RoleGuardConfig,
} from './guards/index.js'

// Hooks
export { createHandle, sequence } from './hooks/index.js'

// Middleware
export {
  corsMiddleware,
  csrfMiddleware,
  loggingMiddleware,
  type LoggingMiddlewareConfig,
  rateLimitMiddleware,
} from './middleware/index.js'

// Cache 模块
export { createCacheHandle, createCacheUtils } from './modules/cache/index.js'

// =============================================================================
// 模块集成（服务端）
// =============================================================================

export type {
  CacheHandleConfig,
  CacheRouteConfig,
  CacheServiceLike,
} from './modules/cache/index.js'
// Crypto 模块
export {
  createCsrfManager,
  createEncryptedCookie,
  signRequest,
  verifyWebhookSignature,
} from './modules/crypto/index.js'

export type {
  CsrfConfig as CryptoCSRFConfig,
  CryptoServiceLike,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './modules/crypto/index.js'
// IAM 模块
export {
  createIamActions,
  createIamHandle,
  requireAuth,
  requirePermission,
  requireRole,
} from './modules/iam/index.js'

export type {
  IamActionResult,
  IamActionsConfig,
  IamHandleConfig,
  IamLocals,
  IamServiceLike,
  SessionData as IamSessionData,
  UserData,
} from './modules/iam/index.js'
// Storage 模块
export { createStorageEndpoint } from './modules/storage/index.js'

export type {
  PresignResult,
  StorageEndpointConfig,
  StorageFileItem,
  StorageServiceLike,
  StorageUploadResult,
} from './modules/storage/index.js'
// Response
export {
  badRequest,
  conflict,
  created,
  error,
  forbidden,
  internalError,
  noContent,
  notFound,
  ok,
  redirect,
  unauthorized,
  validationError,
} from './response.js'

// =============================================================================
// 客户端 Store
// =============================================================================

// 类型
export type {
  ApiResponse,
  CorsConfig,
  CsrfConfig,
  FormError,
  FormValidationResult,
  GuardConfig,
  GuardResult,
  HaiRequestEvent,
  HookConfig,
  Middleware,
  MiddlewareContext,
  RateLimitConfig,
  RouteGuard,
  SessionData,
} from './types.js'
// Validation
export { validateForm, validateParams, validateQuery } from './validation.js'

type KitMessageKey = keyof typeof messagesZhCN
export const getKitMessage
  = core.i18n.createMessageGetter<KitMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })

/**
 * 统一设置所有 hai 模块的默认语言
 *
 * 通过 @hai/core 的集中式 locale 管理器，一次调用即可同步所有模块。
 * 各模块的 createMessageGetter 会读取全局 locale。
 *
 * @example
 * ```ts
 * import { setAllModulesLocale } from '@hai/kit'
 *
 * // 在 i18n handle 中
 * const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
 * setAllModulesLocale(locale)
 * ```
 */
export function setAllModulesLocale(locale: string): void {
  core.i18n.setGlobalLocale(locale)
}
