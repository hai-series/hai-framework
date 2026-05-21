<!--
  DashboardView — 简单的欢迎卡 + 后端连通自检（调用 /auth/me 已在启动时完成）。
  通过 @h-ai/ui 的 PageHeader / Card / Button / Alert 组装。
-->
<script lang='ts'>
  import { Alert, Button, Card, PageHeader } from '@h-ai/ui'
  import { currentUser } from '../lib/auth-store.svelte.js'
  import { navigate } from '../lib/router.svelte.js'

  const me = $derived(currentUser())
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title='Dashboard' description='Tauri v2 + Svelte 5 + @h-ai/api-client demo' />

  {#if me}
    <Card title={`Welcome, ${me.username}`}>
      <p class='text-sm opacity-70'>Signed in via @h-ai/api-client → api-service.</p>

      {#snippet footer()}
        <div class='flex justify-end'>
          <Button variant='primary' size='sm' onclick={() => navigate('/users')}>
            Browse users
          </Button>
        </div>
      {/snippet}
    </Card>
  {/if}

  <Alert variant='info'>
    This desktop app talks to <code>apps/api-service</code> via oRPC contracts.
    Pure Tauri v2 + Svelte 5 + Vite — no SvelteKit.
  </Alert>
</div>
