/**
 * 单条记忆端点：按 ID 删除并校验主体归属。
 * @module routes/api/memories/[id]/+server
 */

import { removeMemory } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

/** 删除时校验主体归属，防止跨主体删除 */
const DeleteMemoryQuerySchema = z.object({
  profileId: z.string().trim().min(1).max(64),
})

export const DELETE = kit.handler(async ({ params, url }) => {
  const { id } = kit.validate.params(params, kit.validate.IdParamSchema)
  const { profileId } = kit.validate.query(url, DeleteMemoryQuerySchema)
  const result = await removeMemory(profileId, id)
  return result.success ? kit.response.ok(undefined) : kit.response.fromError(result.error)
})
