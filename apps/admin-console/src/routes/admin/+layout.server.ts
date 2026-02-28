/**
 * =============================================================================
 * hai Admin Console - 后台布局服务端
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { buildIamPublicConfig } from '$lib/server/iam-public-config'
import { core } from '@h-ai/core'
import { redirect } from '@sveltejs/kit'

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.session) {
    const returnUrl = encodeURIComponent(url.pathname + url.search)
    redirect(302, `/auth/login?returnUrl=${returnUrl}`)
  }

  // 获取应用配置
  const coreConfig = core.config.get('core') as {
    name?: string
    version?: string
    env?: string
    defaultLocale?: string
  } | undefined

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
      name: coreConfig?.name ?? 'hai Admin Console',
      version: coreConfig?.version ?? '0.1.0',
      env: coreConfig?.env ?? 'development',
      locale: coreConfig?.defaultLocale ?? 'zh-CN',
    },
    iamPublicConfig: buildIamPublicConfig({ includeSession: true }),
  }
}
