import type { LayoutServerLoad } from './$types'
import { iam } from '@h-ai/iam'

export const load: LayoutServerLoad = () => ({
  iamPublicConfig: iam.publicConfig,
})
