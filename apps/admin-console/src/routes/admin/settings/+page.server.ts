import type { PageServerLoad } from './$types'
import { readBusinessSettings } from '$lib/server/business-settings.js'
import { requireAdminData } from '$lib/server/iam-admin.js'
import { requirePagePermission } from '$lib/server/security-roles.js'

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.session, 'system:settings')
  return { businessSettings: requireAdminData(await readBusinessSettings()) }
}
