/** 手动归档只开放给审计职责，归档保持在私有存储中。 */
import { audit } from '@h-ai/audit'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const inputSchema = z.object({ id: z.uuid() }).strict()

export const POST = kit.handler(async (event) => {
  kit.guard.require(event.locals.session, 'audit:backup')
  await kit.guard.requireSensitive(iam, event, 'audit.backup')
  const input = await kit.validate.body(event.request, inputSchema)
  const result = await audit.backup.run({ ...input, signal: event.request.signal })
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})
