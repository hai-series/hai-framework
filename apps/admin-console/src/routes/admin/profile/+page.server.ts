import type { PageServerLoad } from './$types'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'

interface ProfileData {
  id: string
  username: string
  email: string
  display_name: string
  phone: string
  avatar: string
  roles: string[]
}

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.session?.userId ?? ''
  const fallbackProfile: ProfileData = {
    id: userId,
    username: locals.session?.username ?? '',
    email: '',
    display_name: '',
    phone: '',
    avatar: '',
    roles: locals.session?.roles ?? [],
  }

  if (!userId) {
    return { profile: fallbackProfile }
  }

  try {
    const [userResult, rolesResult] = await Promise.all([
      iam.user.getUser(userId),
      iam.authz.getUserRoles(userId),
    ])

    if (!userResult.success || !userResult.data) {
      return { profile: fallbackProfile }
    }

    return {
      profile: {
        id: userResult.data.id,
        username: userResult.data.username,
        email: userResult.data.email ?? '',
        display_name: userResult.data.displayName ?? '',
        phone: userResult.data.phone ?? '',
        avatar: userResult.data.avatarUrl ?? '',
        roles: rolesResult.success ? rolesResult.data.map(role => role.code) : fallbackProfile.roles,
      } satisfies ProfileData,
    }
  }
  catch (error) {
    core.logger.error('Failed to load admin profile page data', { error, userId })
    return { profile: fallbackProfile }
  }
}
