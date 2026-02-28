/**
 * =============================================================================
 * @h-ai/kit - 服务对象主入口
 * =============================================================================
 * SvelteKit 集成模块的统一命名空间出口。
 * 所有功能通过 kit 对象访问：
 *
 * - kit.createHandle()  — SvelteKit Handle Hook（含透明加密）
 * - kit.sequence()      — 组合多个 Handle
 * - kit.handler()       — API Handler 包装器（自动错误边界）
 * - kit.guard           — 路由守卫（auth / role / permission / ...）
 * - kit.middleware       — 中间件（cors / csrf / logging / rateLimit）
 * - kit.response        — API 标准响应（ok / error / unauthorized / ...）
 * - kit.validate        — 请求验证（form / query / params / ...）
 * - kit.session         — 会话 Cookie 管理
 * - kit.client          — 客户端工具（create：CSRF + 传输加密）
 * - kit.i18n            — 国际化（setLocale）
 *
 * 加密能力已内置于 createHandle（服务端）与 client.create（客户端），
 * 业务代码无需直接操作底层 crypto API。
 *
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 创建 handle（含透明加密）
 * export const handle = kit.createHandle({
 *   crypto: { crypto, transport: true, encryptedCookies: ['hai_session'] },
 * })
 *
 * // API Handler（自动错误边界）
 * export const GET = kit.handler(async ({ locals, url }) => {
 *   kit.guard.requirePermission(locals.session, 'user:read')
 *   const query = kit.validate.queryOrFail(url, ListSchema)
 *   return kit.response.ok(await fetchData(query))
 * })
 *
 * // 会话管理
 * kit.session.setCookie(cookies, token)
 *
 * // i18n
 * kit.i18n.setLocale('zh-CN')
 * ```
 * =============================================================================
 */

import { createKitClient } from './client/kit-client.js'
import { authGuard } from './guards/kit-auth.js'
import { allGuards, anyGuard, conditionalGuard, notGuard } from './guards/kit-compose.js'
import { assertPermission, hasPermission, permissionGuard, requirePermission } from './guards/kit-permission.js'
import { roleGuard } from './guards/kit-role.js'
import { createHandle, sequence } from './hooks/kit-handle.js'
import { handler } from './kit-handler.js'
import { setAllModulesLocale } from './kit-i18n.js'
import { badRequest, conflict, created, error, forbidden, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from './kit-response.js'
import { clearSessionCookie, setSessionCookie } from './kit-session.js'
import { validateForm, validateFormOrFail, validateParams, validateParamsOrFail, validateQuery, validateQueryOrFail } from './kit-validation.js'
import { corsMiddleware } from './middleware/kit-cors.js'
import { csrfMiddleware } from './middleware/kit-csrf.js'
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

  // ─── 路由守卫 ───

  guard: {
    /** 认证守卫（验证用户是否已登录） */
    auth: authGuard,
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
    /** 验证表单/JSON，失败 throw Response（SvelteKit 控制流） */
    formOrFail: validateFormOrFail,
    /** 验证查询参数，失败 throw Response（SvelteKit 控制流） */
    queryOrFail: validateQueryOrFail,
    /** 验证路径参数，失败 throw Response（SvelteKit 控制流） */
    paramsOrFail: validateParamsOrFail,
  },

  // ─── 会话管理 ───

  session: {
    /** 设置会话 Cookie */
    setCookie: setSessionCookie,
    /** 清除会话 Cookie */
    clearCookie: clearSessionCookie,
  },

  // ─── 客户端工具 ───

  client: {
    /** 创建统一客户端（CSRF + 传输加密透明合并） */
    create: createKitClient,
  },

  // ─── i18n ───

  i18n: {
    /** 统一设置所有 hai 模块的默认语言 */
    setLocale: setAllModulesLocale,
  },
}
