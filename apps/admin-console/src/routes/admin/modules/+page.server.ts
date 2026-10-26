import type { PageServerLoad } from './$types'
import { requirePagePermission } from '$lib/server/security-roles.js'

export const load: PageServerLoad = ({ locals }) => {
  requirePagePermission(locals.session, 'system:modules')
  return {}
}
