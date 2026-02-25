/**
 * =============================================================================
 * @hai/kit - 服务对象主入口
 * =============================================================================
 * SvelteKit 集成模块的统一命名空间出口。
 * 所有功能通过 kit 对象访问：
 *
 * - kit.createHandle()  — SvelteKit Handle Hook
 * - kit.sequence()      — 组合多个 Handle
 * - kit.guard           — 路由守卫（auth / role / permission / all / any / not / conditional）
 * - kit.middleware       — 中间件（cors / csrf / logging / rateLimit）
 * - kit.response        — API 标准响应（ok / error / unauthorized / ...）
 * - kit.validate        — 请求验证（form / query / params）
 * - kit.iam             — IAM 模块集成
 * - kit.cache           — Cache 模块集成
 * - kit.storage         — Storage 模块集成
 * - kit.crypto          — Crypto 模块集成
 * - kit.client          — 客户端 Stores
 * - kit.setAllModulesLocale() — i18n 全局语言设置
 *
 * @example
 * ```ts
 * import { kit } from '@hai/kit'
 *
 * // 创建 handle
 * export const handle = kit.createHandle({ logging: true })
 *
 * // 路由守卫
 * kit.guard.auth({ loginUrl: '/login' })
 *
 * // API 响应
 * return kit.response.ok(data)
 *
 * // 表单验证
 * const { valid, data } = await kit.validate.form(request, schema)
 * ```
 * =============================================================================
 */

import { useIsAuthenticated, useSession, useUpload, useUser } from './client/stores.js'
import { useTransportEncryption } from './client/transport-encryption-store.js'
import { authGuard } from './guards/auth.js'
import { allGuards, anyGuard, conditionalGuard, notGuard } from './guards/compose.js'
import { permissionGuard } from './guards/permission.js'
import { roleGuard } from './guards/role.js'
import { createHandle, sequence } from './hooks/handle.js'
import { setAllModulesLocale } from './kit-i18n.js'
import { badRequest, conflict, created, error, forbidden, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from './kit-response.js'
import { validateForm, validateParams, validateQuery } from './kit-validation.js'
import { corsMiddleware } from './middleware/cors.js'
import { csrfMiddleware } from './middleware/csrf.js'
import { loggingMiddleware } from './middleware/logging.js'
import { rateLimitMiddleware } from './middleware/ratelimit.js'
import { createCacheHandle, createCacheUtils } from './modules/cache/cache-handle.js'
import { createCsrfManager, createEncryptedCookie } from './modules/crypto/crypto-helpers.js'
import { createKeyExchangeHandler, createTransportEncryption, isValidEncryptedPayload } from './modules/crypto/transport-encryption.js'
import { transportEncryptionMiddleware } from './modules/crypto/transport-middleware.js'
import { createIamActions } from './modules/iam/iam-actions.js'
import { createIamHandle, requireAuth } from './modules/iam/iam-handle.js'
import { createStorageEndpoint } from './modules/storage/storage-handle.js'

/**
 * Kit 模块统一出口。
 *
 * 作为纯工具模块，kit 不需要 init/close 生命周期，
 * 所有功能均为无状态工厂函数或工具函数。
 */
export const kit = {
  // ─── Handle Hook ───

  /** 创建 SvelteKit Handle Hook */
  createHandle,
  /** 组合多个 Handle */
  sequence,

  // ─── 路由守卫 ───

  guard: {
    /** 认证守卫（验证用户是否已登录） */
    auth: authGuard,
    /** 角色守卫（验证指定角色） */
    role: roleGuard,
    /** 权限守卫（验证指定权限） */
    permission: permissionGuard,
    /** 所有守卫通过（AND 逻辑） */
    all: allGuards,
    /** 任一守卫通过（OR 逻辑） */
    any: anyGuard,
    /** 取反守卫 */
    not: notGuard,
    /** 条件守卫 */
    conditional: conditionalGuard,
  },

  // ─── 中间件 ───

  middleware: {
    /** CORS 中间件 */
    cors: corsMiddleware,
    /** CSRF 中间件 */
    csrf: csrfMiddleware,
    /** 请求日志中间件 */
    logging: loggingMiddleware,
    /** 速率限制中间件 */
    rateLimit: rateLimitMiddleware,
  },

  // ─── API 响应 ───

  response: {
    /** 200 成功 */
    ok,
    /** 201 创建成功 */
    created,
    /** 204 无内容 */
    noContent,
    /** 自定义错误响应 */
    error,
    /** 400 BadRequest */
    badRequest,
    /** 401 Unauthorized */
    unauthorized,
    /** 403 Forbidden */
    forbidden,
    /** 404 NotFound */
    notFound,
    /** 409 Conflict */
    conflict,
    /** 422 验证错误 */
    validationError,
    /** 500 InternalError */
    internalError,
    /** 重定向 */
    redirect,
  },

  // ─── 验证 ───

  validate: {
    /** 从 Request 解析并验证表单/JSON 数据 */
    form: validateForm,
    /** 从 URL 验证查询参数 */
    query: validateQuery,
    /** 验证路径参数 */
    params: validateParams,
  },

  // ─── 模块集成: IAM ───

  iam: {
    /** 创建 IAM Handle（会话验证 + 权限注入） */
    createHandle: createIamHandle,
    /** 要求认证（未认证抛 401） */
    requireAuth,
    /** 创建 IAM 操作（注册/登录/登出等） */
    createActions: createIamActions,
  },

  // ─── 模块集成: Cache ───

  cache: {
    /** 创建缓存 Handle（路由级缓存） */
    createHandle: createCacheHandle,
    /** 创建缓存工具（手动缓存操作） */
    createUtils: createCacheUtils,
  },

  // ─── 模块集成: Storage ───

  storage: {
    /** 创建存储端点（文件上传/下载/列表等） */
    createEndpoint: createStorageEndpoint,
  },

  // ─── 模块集成: Crypto ───

  crypto: {
    /** 创建 CSRF 令牌管理器 */
    createCsrfManager,
    /** 创建加密 Cookie 管理器 */
    createEncryptedCookie,
    /** 创建传输加密管理器 */
    createTransportEncryption,
    /** 创建密钥交换 API Handler */
    createKeyExchangeHandler,
    /** 检查是否为有效的加密载荷 */
    isValidEncryptedPayload,
    /** 传输加密中间件 */
    transportEncryptionMiddleware,
  },

  // ─── 客户端 Stores ───

  client: {
    /** 会话状态管理 Store */
    useSession,
    /** 文件上传状态管理 Store */
    useUpload,
    /** 认证状态派生 Store */
    useIsAuthenticated,
    /** 用户信息派生 Store */
    useUser,
    /** 传输加密 Store */
    useTransportEncryption,
  },

  // ─── i18n ───

  /** 统一设置所有 hai 模块的默认语言 */
  setAllModulesLocale,
}
