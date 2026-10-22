/**
 * =============================================================================
 * H5 App - 登出 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ locals, cookies }) => {
  const token = locals.accessToken

  const result = await kit.auth.logout(cookies, token)
  if (!result.success)
    return kit.response.fromError(result.error, locals.requestId)

  return kit.response.ok({ loggedOut: true })
})
