<!--
  Admin Console - 审计日志页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { AuditBackupReceipt } from '$lib/services/audit-backup.js'
  import type { PageData } from './$types'
  import { auditLogCrud } from '$lib/crud/admin-crud'
  import * as m from '$lib/paraglide/messages'
  import { newAuditBackupId, runAuditBackup } from '$lib/services/audit-backup.js'
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { Badge, Button, CrudPage } from '@h-ai/ui'
  import { errorMessage as formatOperationError, useToastFeedback } from '@h-ai/ui/toast'

  interface Props {
    data: PageData
  }

  const { data }: Props = $props()
  const nav = createSvelteKitNavAdapter()
  let backupId = $state('')
  let backingUp = $state(false)
  let backupError = $state('')
  let receipt = $state<AuditBackupReceipt | null>(null)
  async function backup() {
    if (backingUp)
      return
    backupId ||= newAuditBackupId()
    backingUp = true
    backupError = ''
    try {
      const result = await runAuditBackup(backupId)
      if (!result.success) {
        backupError = `${formatOperationError(result.error, m.common_error())} ${m.audit_backup_retry_hint()}`
        return
      }
      receipt = result.data
      backupId = ''
    }
    catch { backupError = `${m.common_network_error()} ${m.audit_backup_retry_hint()}` }
    finally { backingUp = false }
  }

  // 将 server 数据转为 CrudPage 需要的格式
  const crudData = $derived({
    items: data.logs.map(log => ({ ...log })),
    total: data.pagination.total,
    page: data.pagination.page,
    pageSize: data.pagination.pageSize,
    filters: data.filters,
  })
  useToastFeedback(() => backupError)
  useToastFeedback(() => receipt ? m.audit_backup_private_hint() : '', 'success')
</script>

<svelte:head>
  <title>{m.logs_title()} - {m.app_title()}</title>
</svelte:head>

<div class='mb-4 space-y-3'>
  <p class='text-sm text-base-content/60'>{m.audit_stats_hint()}</p>
  <div class='flex flex-wrap gap-2'>{#each data.stats as stat (stat.action)}<Badge variant='ghost'>{stat.action}: {stat.count}</Badge>{/each}</div>
  {#if data.backupEnabled}<Button variant='outline' loading={backingUp} onclick={backup} data-testid='audit-backup'>{m.audit_backup_run()}</Button>{/if}
  {#if receipt}<div class='rounded-lg border border-base-content/10 bg-base-200/50 p-3'><p class='break-all font-mono text-xs' data-testid='audit-backup-receipt'>{receipt.key} · {receipt.recordCount} · SHA-256: {receipt.sha256}</p></div>{/if}
</div>

<CrudPage
  crud={auditLogCrud}
  data={crudData}
  permissions={{ create: false, update: false, delete: false }}
  rowClickDetail
  sortableColumns={[{ key: 'createdAt', label: m.logs_col_time() }, { key: 'action', label: m.logs_col_action() }, { key: 'resource', label: m.logs_col_resource() }, { key: 'category', label: m.audit_category() }, { key: 'outcome', label: m.audit_outcome() }, { key: 'severity', label: m.audit_severity() }]}
  {nav}
/>
