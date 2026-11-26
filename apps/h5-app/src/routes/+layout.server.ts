import type { LayoutServerLoad } from './$types'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: LayoutServerLoad = async ({ depends, locals, setHeaders }) => {
  depends('hai:session')
  const publicConfig = await iam.getPublicConfig()
  if (!publicConfig.success) {
    core.logger.error('Failed to load public authentication configuration', { error: publicConfig.error })
    error(503, core.error.toPublic(publicConfig.error).message)
  }
  const sessionFingerprint = publicConfig.data.session.endOnPageHide
    ? kit.auth.sessionFingerprint(locals.accessToken)
    : undefined
  if (sessionFingerprint)
    setHeaders({ 'cache-control': 'private, no-store' })
  return { iamPublicConfig: publicConfig.data, sessionFingerprint }
}
