import { clearPartnerAdminSession } from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ cookies }) => {
  const token = cookies.get('corp_partner_session')

  if (token) {
    await clearPartnerAdminSession(token)
  }

  kit.session.clearCookie(cookies, {
    cookieName: 'corp_partner_session',
  })

  return kit.response.ok({ loggedOut: true })
})
