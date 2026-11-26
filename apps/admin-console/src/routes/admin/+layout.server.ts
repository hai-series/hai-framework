/**
 * =============================================================================
 * hai Admin Console - 后台布局服务端
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { core } from '@h-ai/core'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { redirect } from '@sveltejs/kit'
import { readBusinessSettings } from '#lib/server/business-settings.js'
import { requireAdminData } from '#lib/server/iam-admin.js'

export const load: LayoutServerLoad = async ({ locals, setHeaders, url }) => {
  if (!locals.session) {
    const returnUrl = encodeURIComponent(url.pathname + url.search)
    throw redirect(302, `/auth/login?returnUrl=${returnUrl}`)
  }

  // 获取应用配置
  const coreConfig = core.config.get('core') as {
    name?: string
    version?: string
    env?: string
    defaultLocale?: string
  } | undefined

  // 与认证页面共用 IAM 公开配置，session.maxAge 已包含在标准白名单中。
  const iamPublicConfig = requireAdminData(await iam.getPublicConfig())
  const sessionFingerprint = iamPublicConfig.session.endOnPageHide
    ? kit.auth.sessionFingerprint(locals.accessToken)
    : undefined
  if (sessionFingerprint)
    setHeaders({ 'cache-control': 'private, no-store' })
  return {
    user: {
      id: locals.session.userId,
      username: locals.session.username,
      displayName: locals.session.displayName,
      avatarUrl: locals.session.avatarUrl,
      roles: locals.session.roles,
      permissions: locals.session.permissions,
    },
    appConfig: {
      notice: requireAdminData(await readBusinessSettings()).notice,
      name: coreConfig?.name ?? 'hai Admin Console',
      version: coreConfig?.version ?? '0.1.0',
      env: coreConfig?.env ?? 'development',
      locale: coreConfig?.defaultLocale ?? 'zh-CN',
    },
    iamPublicConfig,
    sessionFingerprint,
    feedbackEnabled: feedback.isInitialized,
  }
}
