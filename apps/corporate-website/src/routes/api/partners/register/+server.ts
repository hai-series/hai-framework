import { createPartnerLead, PartnerLeadSchema } from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const payload = await kit.validate.formOrFail(request, PartnerLeadSchema)

  const result = await createPartnerLead(payload)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.created({
    id: result.data.id,
    status: result.data.status,
    createdAt: result.data.createdAt,
    message: 'Partner registration submitted successfully',
  })
})
