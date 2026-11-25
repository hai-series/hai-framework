import { apiContract, AuditBackupReceiptSchema } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

export type { AuditBackupReceipt } from '@h-ai/api-contract'

const backupPath = `/api${apiContract.pathOf(apiContract.extensions.audit.backup.run)}`

export function newAuditBackupId(): string {
  return core.id.uuid()
}

/** 失败后由调用者保留同一 id 核对/重试，不重复覆盖已有归档。 */
export async function runAuditBackup(id: string) {
  const response = await sensitiveFetch('audit.backup', backupPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  return apiContract.haiResultSchema(AuditBackupReceiptSchema).parse(await response.json())
}
