/** @h-ai/serv — 挂载反馈的会话、处理与附件操作。 */
import type { FeedbackContext, FeedbackHttpOperations } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'

/** 已认证请求到反馈范围的可信映射，返回 null 时拒绝访问。 */
export interface FeedbackProcedureDeps {
  readonly feedback: FeedbackHttpOperations
  readonly resolveContext: (context: AuthenticatedServContext) => FeedbackContext | null | Promise<FeedbackContext | null>
}

/**
 * 创建反馈 procedures；范围和权限由宿主解析，领域服务再次检查资源归属。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback'
 * import { serv } from '@h-ai/serv'
 * const procedures = serv.createFeedbackProcedures({
 *   feedback,
 *   resolveContext: ({ session }) => ({ scopeId: 'orders', userId: session.userId, permissions: session.permissions }),
 * })
 * ```
 */
export function createFeedbackProcedures(deps: FeedbackProcedureDeps) {
  const service = deps.feedback

  async function withActor<T>(context: AuthenticatedServContext, action: (actor: FeedbackContext) => Promise<HaiResult<T>>) {
    let actor: FeedbackContext | null
    try {
      actor = await deps.resolveContext(context)
    }
    catch {
      return core.err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: context.locale }))
    }
    if (!actor?.scopeId || actor.userId !== context.session.userId)
      return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))
    return action(actor)
  }

  return implement(apiContract.feedback)
    .context<ServContext>()

    .route('limits')
    .auth()
    .handle(({ context }) => withActor(context, actor => service.getLimits(actor)))

    .route('reports.submit')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.submit(input, actor)))

    .route('reports.list')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.list(input, actor)))

    .route('reports.listMine')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.listMine(input, actor)))

    .route('reports.get')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.get(input.id, actor)))

    .route('reports.listMessages')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.listMessages(input, actor)))

    .route('reports.addMessage')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.addMessage(input, actor)))

    .route('reports.setStatus')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.setStatus(input, actor)))

    .route('attachments.get')
    .auth()
    .handle(({ input, context }) => withActor(context, actor => service.getAttachment(input, actor)))

    .build()
}
