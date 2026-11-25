import { haiResultSchema } from '../../common/result-schemas.js'
import { route } from '../../common/route.js'
import { AiSessionListDataSchema, AiSessionListInputSchema } from './ai-session-schemas.js'

/**
 * 按主体列出会话的端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.ai.sessions.list
 * void operation
 * ```
 */
export const aiSessionContract = {
  list: route({
    method: 'POST',
    path: '/ai/sessions/list',
    operationId: 'ai.sessions.list',
    summary: 'List sessions',
    tags: ['ai', 'sessions'],
  })
    .input(AiSessionListInputSchema)
    .output(haiResultSchema(AiSessionListDataSchema)),
}
