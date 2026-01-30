/**
 * =============================================================================
 * hai Admin Console - 后台布局服务端
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { core } from '@hai/core'

export const load: LayoutServerLoad = async ({ locals }) => {
  // 获取应用配置
  const coreConfig = core.config.get('core') as {
    name?: string
    version?: string
    env?: string
    timezone?: string
    defaultLocale?: string
  } | undefined

  return {
    user: locals.session
      ? {
          id: locals.session.userId,
          username: locals.session.username,
          roles: locals.session.roles,
        }
      : null,
    appConfig: {
      name: coreConfig?.name ?? 'hai Admin Console',
      version: coreConfig?.version ?? '0.1.0',
      env: coreConfig?.env ?? 'development',
      timezone: coreConfig?.timezone ?? 'Asia/Shanghai',
      locale: coreConfig?.defaultLocale ?? 'zh-CN',
    },
  }
}
