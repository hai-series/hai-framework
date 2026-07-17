/**
 * 记忆集合端点：GET 检索、POST 添加、DELETE 清空当前主体的记忆。
 * @module routes/api/memories/+server
 */

import { MemoryAddRequestSchema, MemoryQuerySchema } from '$lib/ai-lab-types.js'
import { addMemory, clearMemories, findMemories } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

/** 仅含主体 ID 的查询校验（用于清空） */
const ProfileSchema = z.object({ profileId: z.string().trim().min(1).max(64) })

export const GET = kit.handler(async ({ url }) => {
  const query = kit.validate.query(url, MemoryQuerySchema)
  const result = await findMemories(query.profileId, query.query)
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})

export const POST = kit.handler(async ({ request }) => {
  const input = await kit.validate.body(request, MemoryAddRequestSchema)
  const result = await addMemory(input)
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})

export const DELETE = kit.handler(async ({ url }) => {
  const { profileId } = kit.validate.query(url, ProfileSchema)
  const result = await clearMemories(profileId)
  return result.success ? kit.response.ok(undefined) : kit.response.fromError(result.error)
})
