/** @h-ai/serv — 记忆写入 procedures。 */

import type { AIFunctions, ScopedMemoryBinding } from '@h-ai/ai'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { implement } from '../serv-router.js'
import { forbidden, unavailable } from './serv-feature-ai-helpers.js'

/**
 * 宿主收到的记忆写入授权请求。objectId 是待授权的主体，context.session 才是已认证身份。
 * @example
 * ```ts
 * import type { AiMemoryWriteAuthorizationRequest } from '@h-ai/serv'
 *
 * function ownsMemory({ context, objectId }: AiMemoryWriteAuthorizationRequest) {
 *   return objectId === context.session.userId
 * }
 * ```
 */
export interface AiMemoryWriteAuthorizationRequest {
  readonly context: AuthenticatedServContext
  readonly operation: 'add' | 'update' | 'remove' | 'clear'
  readonly objectId: string
  readonly id?: string
}

/**
 * 记忆写入工厂使用的 SDK 能力和作用域解析策略。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import type { AiMemoryWriteProcedureDeps } from '@h-ai/serv'
 *
 * const deps: AiMemoryWriteProcedureDeps = {
 *   ai,
 *   resolveMemoryScope: ({ context, objectId }) => objectId === context.session.userId
 *     ? { objectId, scope: { app: 'chat' } }
 *     : null,
 * }
 * void deps
 * ```
 */
export interface AiMemoryWriteProcedureDeps {
  readonly ai: { readonly memory?: Pick<AIFunctions['memory'], 'scoped'> }
  /** 提供后检查所有记忆写入。省略时本人可以新增、修改或单条删除，清空须由宿主明确授予作用域。 */
  readonly resolveMemoryScope?: (request: AiMemoryWriteAuthorizationRequest) => ScopedMemoryBinding | null | Promise<ScopedMemoryBinding | null>
}

/**
 * 为聊天助手绑定记忆写入，同一账户可以在该助手范围内更新或清空偏好。
 * @param deps - 已初始化的 AI 能力及可选的记忆作用域解析。
 * @returns 包含记忆写入端点的 router。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { serv } from '@h-ai/serv'
 *
 * const procedures = serv.createAiMemoryWriteProcedures({
 *   ai,
 *   resolveMemoryScope: ({ context, objectId }) => objectId === context.session.userId
 *     ? { objectId, scope: { app: 'chat' } }
 *     : null,
 * })
 * void procedures.memories.clear
 * ```
 */
export function createAiMemoryWriteProcedures(deps: AiMemoryWriteProcedureDeps) {
  async function memoryFor(
    operation: AiMemoryWriteAuthorizationRequest['operation'],
    context: AuthenticatedServContext,
    input: { objectId?: string, id?: string },
  ) {
    const objectId = input.objectId ?? context.session.userId
    const binding = deps.resolveMemoryScope
      ? await deps.resolveMemoryScope({
          operation,
          context,
          objectId,
          id: input.id,
        })
      : operation !== 'clear' && objectId === context.session.userId
        ? { objectId }
        : null
    if (!binding?.objectId.trim())
      return forbidden(context)
    return deps.ai.memory
      ? core.ok(deps.ai.memory.scoped(binding))
      : unavailable(context)
  }

  return implement({ memories: apiContract.extensions.ai.memories })
    .context<ServContext>()

    .route('memories.add')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('add', context, input)
      if (!memory.success)
        return memory
      return memory.data.add({ content: input.content, type: input.type, importance: input.importance })
    })

    .route('memories.update')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('update', context, input)
      if (!memory.success)
        return memory
      const { id, content, type, importance } = input
      return memory.data.update(id, { content, type, importance })
    })

    .route('memories.remove')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('remove', context, input)
      return memory.success
        ? memory.data.remove(input.id)
        : memory
    })

    .route('memories.clear')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('clear', context, input)
      return memory.success
        ? memory.data.clear({ types: input.types })
        : memory
    })

    .build()
}
