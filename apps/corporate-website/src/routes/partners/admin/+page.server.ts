import type { PageServerLoad } from './$types'
import { listPartnerLeads, PartnerLeadQuerySchema } from '$lib/server/partner-service.js'

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!locals.session) {
    return {
      records: [],
      total: 0,
      page: 1,
      pageSize: 20,
      search: '',
      status: '',
      loadError: 'Unauthorized',
    }
  }

  const query = PartnerLeadQuerySchema.parse({
    page: url.searchParams.get('page') ?? '1',
    pageSize: url.searchParams.get('pageSize') ?? '20',
    search: url.searchParams.get('search') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  })

  const result = await listPartnerLeads(query)
  if (!result.success) {
    return {
      records: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search ?? '',
      status: query.status ?? '',
      loadError: result.error.message,
    }
  }

  return {
    records: result.data.items,
    total: result.data.total,
    page: query.page,
    pageSize: query.pageSize,
    search: query.search ?? '',
    status: query.status ?? '',
    loadError: '',
  }
}
