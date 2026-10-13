import type { PageServerLoad } from './$types'
import { iam } from '@h-ai/iam'
import { redirect } from '@sveltejs/kit'

/** 未配置发送渠道或关闭重置时，隐藏并禁止访问找回页面。 */
export const load: PageServerLoad = () => {
  if (!iam.publicConfig?.passwordReset.enabled)
    redirect(302, '/auth/login')
}
