/**
 * @h-ai/kit — 服务对象主入口
 *
 * SvelteKit 集成模块的统一命名空间出口。 所有功能通过 kit 对象访问：
 * @module kit-main
 */

import { createKitClient } from './client/kit-client.js'
import { hasPermission, requirePermission } from './guards/kit-permission.js'
import { createHandle, sequence } from './hooks/kit-handle.js'
import {
  clearBrowserToken,
  createHandleFetch,
  createTokenStore,
  login,
  loginWithLdap,
  loginWithOtp,
  logout,
  registerAndLogin,
  setBrowserToken,
} from './kit-auth.js'
import { fromContract } from './kit-contract.js'
import { handler } from './kit-handler.js'
import { setAllModulesLocale } from './kit-i18n.js'
import { badRequest, conflict, created, error, forbidden, fromError, fromResult, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from './kit-response.js'
import { IdParamSchema, PaginationQuerySchema, validateFormOrFail, validateParamsOrFail, validateQueryOrFail } from './kit-validation.js'

/**
 * Kit 模块统一出口。
 *
 * 作为纯工具模块，kit 不需要 init/close 生命周期，
 * 所有功能均为无状态工厂函数或工具函数。
 */
export const kit = {
  // ─── Handle Hook ───

  /** 创建 SvelteKit Handle Hook（含 auth / logging / rateLimit 内置配置） */
  createHandle,
  /** 组合多个 Handle */
  sequence,
  /** API Handler 包装器（自动错误边界） */
  handler,
  /** 基于 API 契约创建类型安全的路由 handler */
  fromContract,

  // ─── 路由守卫 ───

  guard: {
    /** 要求权限，不满足时 throw Response（SvelteKit 控制流） */
    require: requirePermission,
    /** 检查会话是否具有指定权限（布尔） */
    check: hasPermission,
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
    /** 将 Result<T, E> 转为标准 API Response（支持 httpStatusMap） */
    fromResult,
    /** 将模块错误码映射为标准 HTTP Response */
    fromError,
  },

  // ─── 验证 ───

  validate: {
    /** 验证请求体（JSON/表单），失败 throw Response */
    body: validateFormOrFail,
    /** 验证查询参数，失败 throw Response */
    query: validateQueryOrFail,
    /** 验证路径参数，失败 throw Response */
    params: validateParamsOrFail,
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

  // ─── 认证工具 ───

  auth: {
    /** 服务端登录（密码）：内部调用 iam.auth.login + 自动写入 Token Cookie */
    login,
    /** 服务端登录（OTP 验证码）：内部调用 iam.auth.loginWithOtp + 自动写入 Token Cookie */
    loginWithOtp,
    /** 服务端登录（LDAP）：内部调用 iam.auth.loginWithLdap + 自动写入 Token Cookie */
    loginWithLdap,
    /** 服务端注册并登录：内部调用 iam.auth.registerAndLogin + 自动写入 Token Cookie */
    registerAndLogin,
    /** 服务端登出：内部调用 iam.auth.logout + 清除 Token Cookie */
    logout,
    /** 写入浏览器端 Access Token（客户端 login/register 用） */
    setBrowserToken,
    /** 清除浏览器端 Access Token（客户端 logout 用） */
    clearBrowserToken,
    /** 创建浏览器端 Token 存储器（自定义 key 时使用） */
    createTokenStore,
    /** 创建浏览器端同源请求自动附加 Authorization 的 HandleFetch */
    createHandleFetch,
  },

  // ─── i18n ───

  i18n: {
    /** 统一设置所有 hai 模块的默认语言 */
    setLocale: setAllModulesLocale,
  },
}
