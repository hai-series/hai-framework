import { z } from 'zod'
import { haiResultSchema, HaiVoidResultSchema } from '../../common/result-schemas.js'
import { route } from '../../common/route.js'
import {
  AiMemoryEntrySchema,
  AiMemoryListDataSchema,
  AiMemoryListInputSchema,
  AiMemoryRecallDataSchema,
  AiMemoryRecallInputSchema,
  AiMemoryTypeSchema,
} from './ai-memory-schemas.js'

const objectId = z.string().trim().min(1).max(128).optional()
const memoryId = z.string().trim().min(1).max(128)
const memoryFields = {
  content: z.string().trim().min(1).max(5000),
  type: AiMemoryTypeSchema,
  importance: z.number().min(0).max(1).optional(),
}
const memoryUpdate = z.object(memoryFields).partial().extend({ id: memoryId, objectId }).strict().refine(input => input.content !== undefined || input.type !== undefined || input.importance !== undefined)
const memoryOutput = haiResultSchema(AiMemoryEntrySchema)

/**
 * 查询和召回当前主体记忆的端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.ai.memories.list
 * void operation
 * ```
 */
export const aiMemoryReadContract = {
  recall: route({
    method: 'POST',
    path: '/ai/memories/recall',
    operationId: 'ai.memories.recall',
    summary: 'Recall relevant memories',
    tags: ['ai', 'memories'],
  })
    .input(AiMemoryRecallInputSchema)
    .output(haiResultSchema(AiMemoryRecallDataSchema)),
  list: route({
    method: 'POST',
    path: '/ai/memories/list',
    operationId: 'ai.memories.list',
    summary: 'List memories',
    tags: ['ai', 'memories'],
  })
    .input(AiMemoryListInputSchema)
    .output(haiResultSchema(AiMemoryListDataSchema)),
}

/**
 * 新增、编辑、删除和清空授权范围内记忆的端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.extensions.ai.memories.add
 * void operation
 * ```
 */
export const aiMemoryWriteContract = {
  add: route({
    method: 'POST',
    path: '/ai/memories',
    operationId: 'ai.memories.add',
    summary: 'Add an owned memory',
    tags: ['ai', 'memories'],
  })
    .input(z.object({ ...memoryFields, objectId }).strict())
    .output(memoryOutput),
  update: route({
    method: 'PATCH',
    path: '/ai/memories/{id}',
    operationId: 'ai.memories.update',
    summary: 'Update an owned memory',
    tags: ['ai', 'memories'],
  })
    .input(memoryUpdate)
    .output(memoryOutput),
  remove: route({
    method: 'DELETE',
    path: '/ai/memories/{id}',
    operationId: 'ai.memories.remove',
    summary: 'Remove an owned memory',
    tags: ['ai', 'memories'],
  })
    .input(z.object({ id: memoryId, objectId }).strict())
    .output(HaiVoidResultSchema),
  clear: route({
    method: 'DELETE',
    path: '/ai/memories',
    operationId: 'ai.memories.clear',
    summary: 'Clear memories in an authorized scope',
    tags: ['ai', 'memories'],
  })
    .input(z.object({
      objectId,
      types: z.array(AiMemoryTypeSchema).min(1).optional(),
    }).strict())
    .output(HaiVoidResultSchema),
}
