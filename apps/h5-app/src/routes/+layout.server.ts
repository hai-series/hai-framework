import type { LayoutServerLoad } from './$types'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { error } from '@sveltejs/kit'

export const load: LayoutServerLoad = async () => {
  const publicConfig = await iam.getPublicConfig()
  if (!publicConfig.success) {
    core.logger.error('Failed to load public authentication configuration', { error: publicConfig.error })
    error(503, { message: core.error.toPublic(publicConfig.error).message })
  }
  return { iamPublicConfig: publicConfig.data }
}
