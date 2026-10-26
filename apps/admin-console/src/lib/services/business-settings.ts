import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

export async function saveBusinessNotice(notice: string) {
  const response = await sensitiveFetch('business.settings.update', '/api/business/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notice }) })
  return apiContract.haiResultSchema(z.object({ notice: z.string() })).parse(await response.json())
}
