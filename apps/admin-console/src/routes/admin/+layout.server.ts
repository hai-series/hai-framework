/**
 * =============================================================================
 * hai Admin Console - 后台布局服务端
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.session
      ? {
          id: locals.session.userId,
          username: locals.session.username,
          roles: locals.session.roles,
        }
      : null,
  }
}
