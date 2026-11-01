import { clearPartnerAdminSession } from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ cookies }) => {
  const token = cookies.get('corp_partner_access_token')

  if (token) {
    const revoked = await clearPartnerAdminSession(token)
    if (!revoked.success)
      return kit.response.fromError(revoked.error)
  }

  cookies.delete('corp_partner_access_token', { path: '/' })

  return kit.response.ok({ loggedOut: true })
})
