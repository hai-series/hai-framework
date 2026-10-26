import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

const receiptSchema = z.object({ id: z.string(), key: z.string(), recordCount: z.number(), sha256: z.string(), createdAt: z.string(), cutoff: z.string() })
export type AuditBackupReceipt = z.infer<typeof receiptSchema>

export function newAuditBackupId(): string {
  return core.id.uuid()
}

/** 失败后由调用者保留同一 id 核对/重试，不重复覆盖已有归档。 */
export async function runAuditBackup(id: string) {
  const response = await sensitiveFetch('audit.backup', '/api/audit/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  return apiContract.haiResultSchema(receiptSchema).parse(await response.json())
}
