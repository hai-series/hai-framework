/**
 * =============================================================================
 * H5 App - 登出 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ locals, cookies }) => {
  const token = locals.accessToken

  await kit.auth.logout(cookies, token)

  return kit.response.ok({ loggedOut: true })
})
