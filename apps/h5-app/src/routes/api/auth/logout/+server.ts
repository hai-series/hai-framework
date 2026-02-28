/**
 * =============================================================================
 * H5 App - 登出 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ cookies }) => {
  kit.session.clearCookie(cookies)
  return kit.response.ok({ loggedOut: true })
})
