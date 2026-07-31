/**
 * @h-ai/serv — procedure 认证与授权 guard
 *
 * 将认证、权限、角色及异常映射合并为单个 handler 包装层，并在类型上把
 * `context.session` 收窄为非空。
 *
 * @module pipelines/serv-pipeline-guard
 */

import type { HaiResult } from '@h-ai/core'
import type { ErrorMap, Meta, ProcedureHandler } from '@orpc/server'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'

/**
 * 通配符权限。仅应授予受信任的超级管理员，可通过任意 permission guard。
 */
export const WILDCARD_PERMISSION = '*'

/**
 * 通配符角色。仅应授予受信任的超级管理员，可通过任意 role guard。
 */
export const WILDCARD_ROLE = '*'

export interface ServGuardRequirements {
  readonly auth?: boolean
  readonly permissions?: readonly string[]
  readonly roles?: readonly string[]
}

/**
 * 将 guard 应用于一个使用 HaiResult 输出的 oRPC handler。
 *
 * 完整保留 oRPC 的 `path`、`procedure`、`signal`、`lastEventId`、`errors` 等
 * options；只在校验成功后把 `context` 收窄为带非空 session 的类型。
 */
export function applyServGuards<
  TContext extends ServContext,
  TInput,
  TData,
  TErrorMap extends ErrorMap,
  TMeta extends Meta,
>(
  requirements: ServGuardRequirements,
  handler: ProcedureHandler<
    AuthenticatedServContext<TContext>,
    TInput,
    HaiResult<TData>,
    TErrorMap,
    TMeta
  >,
): ProcedureHandler<TContext, TInput, HaiResult<TData>, TErrorMap, TMeta> {
  return async (options) => {
    try {
      if (!hasAuthenticatedSession(options.context)) {
        return err(
          HaiCommonError.UNAUTHORIZED,
          servM('serv_errorUnauthorized', { locale: options.context.locale }),
        )
      }

      const { session } = options.context
      if (requirements.permissions?.length) {
        const allowed = session.permissions.includes(WILDCARD_PERMISSION)
          || requirements.permissions.every(
            permission => session.permissions.includes(permission),
          )
        if (!allowed) {
          return err(
            HaiCommonError.FORBIDDEN,
            servM('serv_errorForbidden', { locale: options.context.locale }),
          )
        }
      }

      if (requirements.roles?.length) {
        const allowed = session.roles.includes(WILDCARD_ROLE)
          || requirements.roles.every(
            role => session.roles.includes(role),
          )
        if (!allowed) {
          return err(
            HaiCommonError.FORBIDDEN,
            servM('serv_errorForbidden', { locale: options.context.locale }),
          )
        }
      }

      return await handler({
        ...options,
        context: options.context,
      })
    }
    catch (error) {
      return err(
        HaiCommonError.INTERNAL_ERROR,
        servM('serv_errorInternal', { locale: options.context.locale }),
        error,
      )
    }
  }
}

function hasAuthenticatedSession<TContext extends ServContext>(
  context: TContext,
): context is AuthenticatedServContext<TContext> {
  return context.session !== undefined && context.session !== null
}
