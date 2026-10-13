import type { PageServerLoad } from './$types'
import { iam } from '@h-ai/iam'
import { redirect } from '@sveltejs/kit'

/** 关闭重置时，不展示可提交的重置表单。 */
export const load: PageServerLoad = () => {
  if (!iam.publicConfig?.passwordReset.enabled)
    redirect(302, '/auth/login')
}
