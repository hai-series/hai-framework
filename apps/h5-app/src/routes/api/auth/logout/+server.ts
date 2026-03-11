/**
 * =============================================================================
 * H5 App - 登出 API
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ cookies }) => {
  const token = cookies.get('h5_access_token')
  if (token) {
    await iam.auth.logout(token)
  }

  cookies.delete('h5_access_token', { path: '/' })

  return kit.response.ok({ loggedOut: true })
})
