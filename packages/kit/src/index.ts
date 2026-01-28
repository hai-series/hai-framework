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
 * =============================================================================
 */

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

// Hooks
export { createHandle, sequence } from './hooks/index.js'

// Middleware
export {
  corsMiddleware,
  csrfMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  type LoggingMiddlewareConfig,
} from './middleware/index.js'

// Guards
export {
  allGuards,
  anyGuard,
  authGuard,
  conditionalGuard,
  notGuard,
  permissionGuard,
  roleGuard,
  type AuthGuardConfig,
  type PermissionGuardConfig,
  type RoleGuardConfig,
} from './guards/index.js'

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

// Validation
export { validateForm, validateParams, validateQuery } from './validation.js'
