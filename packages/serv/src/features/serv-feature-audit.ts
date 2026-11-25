import type { AuditBackupReceipt, AuditLogListInput } from '@h-ai/api-contract'
import type { AuditFunctions, ListAuditLogsOptions } from '@h-ai/audit'
import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'

/**
 * 已授权的审计读取范围。跨租户读取需要宿主显式声明全局职责。
 * @example
 * ```ts
 * import type { AuditReadScope } from '@h-ai/serv'
 *
 * const scope: AuditReadScope = { scopeId: 'tenant-a' }
 * ```
 */
export type AuditReadScope = { readonly scopeId: string } | { readonly global: true }

/**
 * 审计 REST 实现所需的已初始化 Audit、读取范围策略及归档再认证校验。
 * @example
 * ```ts
 * import type { AuditProcedureDeps } from '@h-ai/serv'
 * import { audit } from '@h-ai/audit'
 * import { iam } from '@h-ai/iam'
 *
 * const deps: AuditProcedureDeps = {
 *   audit,
 *   resolveReadScope: ({ session }) => session.roles.includes('central-auditor') ? { global: true } : null,
 *   authorizeBackup: ({ accessToken, request }) => iam.auth.checkSensitiveOperation(
 *     accessToken ?? '',
 *     'audit.backup',
 *     request.headers.get('x-hai-reauthentication') ?? undefined,
 *   ),
 * }
 * ```
 */
export interface AuditProcedureDeps {
  readonly audit: Pick<AuditFunctions, 'list' | 'getStats'> & {
    readonly backup: Pick<AuditFunctions['backup'], 'run'>
  }
  /** 从可信上下文确定日志范围。返回 null 表示拒绝。 */
  readonly resolveReadScope: (context: AuthenticatedServContext) => AuditReadScope | null | Promise<AuditReadScope | null>
  /** 核对全局归档职责及绑定到 audit.backup 的再认证；失败时直接返回业务错误。 */
  readonly authorizeBackup: (context: AuthenticatedServContext) => HaiResult<void> | Promise<HaiResult<void>>
}

function toListOptions(input: AuditLogListInput, scopeId: string | undefined): ListAuditLogsOptions {
  const { startDate, endDate, ...filters } = input
  return {
    ...filters,
    scopeId,
    startDate: startDate === undefined
      ? undefined
      : new Date(startDate),
    endDate: endDate === undefined
      ? undefined
      : new Date(endDate),
  }
}

/**
 * 创建按审计职责启用的日志列表、统计和私有归档 procedures。
 * @example
 * ```ts
 * import type { AuditProcedureDeps } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * function createAuditApp(deps: AuditProcedureDeps) {
 *   return serv.createApp({
 *     contract: apiContract.extensions.audit,
 *     procedures: serv.createAuditProcedures(deps),
 *   })
 * }
 * ```
 */
export function createAuditProcedures(deps: AuditProcedureDeps) {
  async function resolveScope(context: AuthenticatedServContext, requestedScope: string | undefined): Promise<HaiResult<string | undefined>> {
    const scope = await deps.resolveReadScope(context)
    if (scope && 'global' in scope && scope.global === true)
      return core.ok(requestedScope)
    if (scope && 'scopeId' in scope && scope.scopeId.trim() && (requestedScope === undefined || requestedScope === scope.scopeId))
      return core.ok(scope.scopeId)
    return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))
  }

  return implement(apiContract.extensions.audit)
    .context<ServContext>()
    .route('logs.list')
    .permission('audit:read')
    .handle(async ({ input, context }) => {
      const scope = await resolveScope(context, input.scopeId)
      if (!scope.success)
        return scope

      const result = await deps.audit.list(toListOptions(input, scope.data))
      if (!result.success)
        return result

      return core.ok({
        ...result.data,
        items: result.data.items.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      })
    })
    .route('logs.stats')
    .permission('audit:read')
    .handle(async ({ input, context }) => {
      const scope = await resolveScope(context, input.scopeId)
      if (!scope.success)
        return scope

      const { days, ...filters } = input
      return deps.audit.getStats(days, { ...filters, scopeId: scope.data })
    })
    .route('backup.run')
    .permission('audit:backup')
    .handle(async ({ input, context }): Promise<HaiResult<AuditBackupReceipt>> => {
      const authorized = await deps.authorizeBackup(context)
      if (!authorized.success)
        return authorized

      const result = await deps.audit.backup.run({ id: input.id, signal: context.request.signal })
      if (!result.success)
        return result

      return core.ok({
        ...result.data,
        createdAt: result.data.createdAt.toISOString(),
        cutoff: result.data.cutoff.toISOString(),
      })
    })
    .build()
}
