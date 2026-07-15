<!--
  Admin Console - 审计日志页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { PageData } from './$types'
  import { auditLogCrud } from '$lib/crud/admin-crud'
  import * as m from '$lib/paraglide/messages'
  import { CrudPage } from '@h-ai/ui'

  interface Props {
    data: PageData
  }

  const { data }: Props = $props()

  // 将 server 数据转为 CrudPage 需要的格式
  const crudData = $derived({
    items: data.logs.map(log => ({ ...log })),
    total: data.pagination.total,
    page: data.pagination.page,
    pageSize: data.pagination.pageSize,
  })
</script>

<svelte:head>
  <title>{m.logs_title()} - {m.app_title()}</title>
</svelte:head>

<CrudPage
  crud={auditLogCrud}
  data={crudData}
  permissions={{ create: false, update: false, delete: false }}
  rowClickDetail={false}
/>
