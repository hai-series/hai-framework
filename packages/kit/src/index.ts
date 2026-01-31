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

// Guards
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

// =============================================================================
// 模块集成（服务端）
// =============================================================================

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

// Cache 模块
export { createCacheHandle, createCacheUtils } from './modules/cache/index.js'
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
  CryptoServiceLike,
  CsrfConfig as CryptoCSRFConfig,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './modules/crypto/index.js'

// =============================================================================
// 客户端 Store
// =============================================================================

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

// i18n
import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

export type KitMessageKey = keyof typeof messagesZhCN
export const { getMessage: getKitMessage, setDefaultLocale: setKitDefaultLocale }
  = core.i18n.createMessageGetter<KitMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })
