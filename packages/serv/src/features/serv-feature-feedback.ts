/** @h-ai/serv — 按需挂载反馈领域，不接收客户端身份或对象存储路径。 */
import type { FeedbackContext, FeedbackFunctions } from '@h-ai/feedback'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'

/**
 * 已认证请求到反馈范围的可信映射，返回 null 时拒绝访问。
 * @example
 * ```ts
 * import type { FeedbackProcedureDeps } from '@h-ai/serv/features/feedback'
 * import { feedback } from '@h-ai/feedback'
 * const deps: FeedbackProcedureDeps = { feedback, resolveContext: ({ session }) => ({ scopeId: 'tenant-from-server', userId: session.userId, permissions: session.permissions }) }
 * ```
 */
export interface FeedbackProcedureDeps {
  readonly feedback: FeedbackFunctions
  readonly resolveContext: (context: AuthenticatedServContext) => FeedbackContext | null | Promise<FeedbackContext | null>
}

/**
 * 创建反馈的默认 procedures。宿主解析租户与权限，领域模块再次检查资源范围。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback'
 * import { createFeedbackProcedures } from '@h-ai/serv/features/feedback'
 * const procedures = createFeedbackProcedures({ feedback, resolveContext: ({ session }) => ({ scopeId: 'trusted-tenant', userId: session.userId, permissions: session.permissions }) })
 * ```
 */
export function createFeedbackProcedures(deps: FeedbackProcedureDeps) {
  const contextFor = async (context: AuthenticatedServContext) => {
    try {
      const actor = await deps.resolveContext(context)
      if (!actor?.scopeId || actor.userId !== context.session.userId)
        return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))
      return { success: true as const, data: actor }
    }
    catch {
      return err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: context.locale }))
    }
  }
  const router = implement(apiContract.feedback).context<ServContext>()
  return router
    .route('reports.submit')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.submit(input, actor.data))
    })
    .route('reports.list')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.list(input, actor.data))
    })
    .route('reports.get')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.get(input.id, actor.data))
    })
    .route('reports.getEvidence')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.getEvidence(input, actor.data))
    })
    .route('reports.setStatus')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.setStatus(input, actor.data))
    })
    .route('reports.retry')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.retry(input, actor.data))
    })
    .route('reports.export')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.export(input, actor.data))
    })
    .route('reports.getExport')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.getExport(input, actor.data))
    })
    .route('reports.appendEvidence')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.appendEvidence(input, actor.data))
    })
    .route('reports.completeCollection')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.completeCollection(input, actor.data))
    })
    .route('attachments.upload')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.uploadAttachment(input, actor.data))
    })
    .route('attachments.get')
    .auth()
    .handle(async ({ input, context }) => {
      const actor = await contextFor(context)
      if (!actor.success)
        return actor
      return core.context.run(actor.data, () => deps.feedback.getAttachment(input, actor.data))
    })
    .build()
}
