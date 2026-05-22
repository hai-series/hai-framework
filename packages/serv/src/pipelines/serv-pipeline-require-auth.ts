/**
 * @h-ai/serv — requireAuth 默认实现
 * @module pipelines/serv-pipeline-require-auth
 */

import type { ServProcedureHandler } from './serv-pipeline-types.js'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { mapHaiError } from './serv-pipeline-helper.js'

/**
 * 需要已验证会话的 procedure 包装器。
 *
 * `context.session` 由 `buildAuthContextFactory(verifyToken)`（或 `serv.createApp({ iam })` 自动启用）填充。
 * token 不存在或无效（verifyToken 失败）时 `session` 均为 `undefined`，统一返回 401 UNAUTHORIZED。
 * 内置调用 `mapHaiError`，无需外层再次封装。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带认证检查的新 handler
 *
 * @example
 * ```ts
 * const protectedHandler = serv.requireAuth(myHandler)
 * ```
 */
export function requireAuth<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return mapHaiError(async (options) => {
    // 关键点：只认 `context.session`，不认“请求头里似乎带了 access token”。
    // session 只能来自 createContext/verifyToken 的成功校验结果，避免把未验证 token 当成已登录。
    if (!options.context.session)
      return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: options.context.locale }))
    return handler(options)
  })
}
