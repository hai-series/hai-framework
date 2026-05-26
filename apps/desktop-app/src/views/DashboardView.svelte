<!--
  DashboardView — 欢迎卡 + api-service 自定义 app 端点联调面板。
  通过 @h-ai/ui 的 PageHeader / Card / Button / Alert 组装。
-->
<script lang='ts'>
  import { Alert, Button, Card, PageHeader } from '@h-ai/ui'
  import { onMount } from 'svelte'
  import { currentUser, hasPermission } from '../lib/auth-store.svelte.js'
  import { navigate } from '../lib/router.svelte.js'
  import {
    currentEchoError,
    currentEchoResult,
    currentServiceInfo,
    currentServiceInfoError,
    isEchoLoading,
    isServiceInfoLoading,
    refreshServiceInfo,
    sendEcho,
  } from '../lib/service-status.svelte.js'

  const me = $derived(currentUser())
  let message = $state('Hello from desktop-app')

  onMount(() => {
    void refreshServiceInfo()
  })

  async function handleEcho(): Promise<void> {
    const trimmed = message.trim()
    if (!trimmed)
      return
    await sendEcho(trimmed)
  }
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title='Dashboard' description='Tauri v2 + Svelte 5 + api-service integration' />

  {#if me}
    <Card title={`Welcome, ${me.username}`}>
      <p class='text-sm opacity-70'>Signed in via the api-service typed client with transport encryption enabled.</p>

      {#snippet footer()}
        <div class='flex justify-end gap-2'>
          <Button variant='ghost' size='sm' onclick={() => void refreshServiceInfo()}>
            Refresh service info
          </Button>
          {#if hasPermission('user:list')}
            <Button variant='primary' size='sm' onclick={() => navigate('/users')}>
              Browse users
            </Button>
          {/if}
        </div>
      {/snippet}
    </Card>
  {/if}

  <Card title='api-service status'>
    {#if isServiceInfoLoading()}
      <p class='text-sm opacity-70'>Loading service info...</p>
    {:else if currentServiceInfoError()}
      <Alert variant='error' title='Service info failed'>
        {currentServiceInfoError()}
      </Alert>
    {:else if currentServiceInfo()}
      <div class='grid gap-3 md:grid-cols-2'>
        <div>
          <p class='text-sm opacity-60'>Service name</p>
          <p class='font-medium'>{currentServiceInfo()?.name}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>Version</p>
          <p class='font-medium'>{currentServiceInfo()?.version}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>Transport encryption</p>
          <p class='font-medium'>{currentServiceInfo()?.transportEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>Uptime</p>
          <p class='font-medium'>{Math.round((currentServiceInfo()?.uptimeMs ?? 0) / 1000)}s</p>
        </div>
      </div>
    {/if}
  </Card>

  <Card title='Authenticated echo test'>
    <div class='flex flex-col gap-3'>
      <label class='form-control w-full'>
        <span class='label-text text-sm opacity-70'>Message</span>
        <input
          bind:value={message}
          class='input input-bordered w-full'
          maxlength='2000'
          placeholder='Say hello to api-service'
        />
      </label>

      <div class='flex justify-end'>
        <Button variant='primary' size='sm' loading={isEchoLoading()} onclick={handleEcho}>
          Send echo
        </Button>
      </div>

      {#if currentEchoError()}
        <Alert variant='error' title='Echo failed'>
          {currentEchoError()}
        </Alert>
      {/if}

      {#if currentEchoResult()}
        <div class='bg-base-200 rounded-box grid gap-3 p-4 md:grid-cols-2'>
          <div>
            <p class='text-sm opacity-60'>Echoed message</p>
            <p class='font-medium'>{currentEchoResult()?.message}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>User ID</p>
            <p class='font-medium break-all'>{currentEchoResult()?.userId}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>Request ID</p>
            <p class='font-medium break-all'>{currentEchoResult()?.requestId}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>Timestamp</p>
            <p class='font-medium'>{currentEchoResult()?.timestamp}</p>
          </div>
        </div>
      {/if}
    </div>
  </Card>

  <Alert variant='info'>
    This desktop app now uses the full api-service contract, including the custom <code>app.info</code> and <code>app.echo</code> endpoints.
  </Alert>
</div>
