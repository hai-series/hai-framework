import {
  createPartnerAdminSession,
  getPartnerAdminConfig,
  PartnerAdminLoginSchema,
  verifyPartnerAdminCredential,
} from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies }) => {
  const { username, password } = await kit.validate.formOrFail(request, PartnerAdminLoginSchema)

  if (!verifyPartnerAdminCredential(username, password)) {
    return kit.response.error('AUTH_FAILED', 'Invalid username or password', 401)
  }

  const token = await createPartnerAdminSession(username)
  const config = getPartnerAdminConfig()

  kit.session.setCookie(cookies, token, {
    cookieName: 'corp_partner_session',
    maxAge: config.sessionTtlSeconds,
  })

  return kit.response.ok({
    username,
    loggedIn: true,
  })
})
