/**
 * @h-ai/kit — 服务对象主入口
 *
 * SvelteKit 集成模块的统一命名空间出口。 所有功能通过 kit 对象访问：
 * @module kit-main
 */

import { createKitClient } from './client/kit-client.js'
import { authGuard, sessionGuard } from './guards/kit-auth.js'
import { allGuards, anyGuard, conditionalGuard, notGuard } from './guards/kit-compose.js'
import { assertPermission, hasPermission, permissionGuard, requirePermission } from './guards/kit-permission.js'
import { roleGuard } from './guards/kit-role.js'
import { createHandle, sequence } from './hooks/kit-handle.js'
import {
  clearAccessTokenCookie,
  clearBrowserAccessToken,
  createBrowserTokenStore,
  createHandleFetch,
  setAccessTokenCookie,
  setBrowserAccessToken,
} from './kit-auth.js'
import { fromContract } from './kit-contract.js'
import { handler } from './kit-handler.js'
import { setAllModulesLocale } from './kit-i18n.js'
import { badRequest, conflict, created, error, forbidden, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from './kit-response.js'
import { IdParamSchema, PaginationQuerySchema, validateForm, validateFormOrFail, validateParams, validateParamsOrFail, validateQuery, validateQueryOrFail } from './kit-validation.js'
import { corsMiddleware } from './middleware/kit-cors.js'
import { loggingMiddleware } from './middleware/kit-logging.js'
import { rateLimitMiddleware } from './middleware/kit-ratelimit.js'

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
  /** API Handler 包装器（自动错误边界） */
  handler,
  /** 基于 API 契约创建类型安全的路由 handler */
  fromContract,

  // ─── 路由守卫 ───

  guard: {
    /** 认证守卫（验证用户是否已登录） */
    auth: authGuard,
    /** 会话守卫（自动从 Bearer/Cookie 恢复 session） */
    session: sessionGuard,
    /** 角色守卫（验证指定角色） */
    role: roleGuard,
    /** 权限守卫（验证指定权限） */
    permission: permissionGuard,
    /** 检查会话是否具有指定权限（布尔） */
    hasPermission,
    /** 断言权限，不满足时返回 403 Response（用于 API Handler） */
    assertPermission,
    /** 要求权限，不满足时 throw Response（SvelteKit 控制流） */
    requirePermission,
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
    /** 验证表单/JSON，失败 throw Response（SvelteKit 控制流） */
    formOrFail: validateFormOrFail,
    /** 验证查询参数，失败 throw Response（SvelteKit 控制流） */
    queryOrFail: validateQueryOrFail,
    /** 验证路径参数，失败 throw Response（SvelteKit 控制流） */
    paramsOrFail: validateParamsOrFail,
    /** 路径参数 id Schema（{id: string}） */
    IdParamSchema,
    /** 通用分页查询 Schema（page / pageSize / search） */
    PaginationQuerySchema,
  },

  // ─── 客户端工具 ───

  client: {
    /** 创建统一客户端（CSRF + 传输加密透明合并） */
    create: createKitClient,
  },

  // ─── Bearer 认证工具 ───

  auth: {
    /** 写入固定名 Access Token Cookie（服务端 login/register 用） */
    setAccessTokenCookie,
    /** 清理固定名 Access Token Cookie（服务端 logout 用） */
    clearAccessTokenCookie,
    /** 写入浏览器端 Access Token（客户端 login/register 用） */
    setBrowserAccessToken,
    /** 清除浏览器端 Access Token（客户端 logout 用） */
    clearBrowserAccessToken,
    /** 创建浏览器端 Token 存储器（自定义 key 时使用，如 h5-app） */
    createBrowserTokenStore,
    /** 创建浏览器端同源请求自动附加 Authorization 的 HandleFetch */
    createHandleFetch,
  },

  // ─── i18n ───

  i18n: {
    /** 统一设置所有 hai 模块的默认语言 */
    setLocale: setAllModulesLocale,
  },
}
