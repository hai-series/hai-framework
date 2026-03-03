import { listPartnerLeads, PartnerLeadQuerySchema } from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ url }) => {
  const query = kit.validate.queryOrFail(url, PartnerLeadQuerySchema)

  const result = await listPartnerLeads(query)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok(result.data)
})
