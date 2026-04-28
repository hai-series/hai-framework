import process from 'node:process'
import {
  createPartnerAdminSession,
  getPartnerAdminConfig,
  PartnerAdminLoginSchema,
  verifyPartnerAdminCredential,
} from '$lib/server/partner-service.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies }) => {
  const { username, password } = await kit.validate.body(request, PartnerAdminLoginSchema)

  if (!verifyPartnerAdminCredential(username, password)) {
    return kit.response.error('AUTH_FAILED', 'Invalid username or password', 401)
  }

  const token = await createPartnerAdminSession(username)
  const config = getPartnerAdminConfig()

  cookies.set('corp_partner_access_token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: config.sessionTtlSeconds,
  })

  return kit.response.ok({
    username,
    loggedIn: true,
    expiresIn: config.sessionTtlSeconds,
  })
})
