<!--
  DashboardView — 欢迎卡 + api-service 自定义 app 端点联调面板。
  通过 @h-ai/ui 的 PageHeader / Card / Button / Alert 组装。
-->
<script lang='ts'>
  import { Alert, Button, Card, PageHeader } from '@h-ai/ui'
  import { useToastFeedback } from '@h-ai/ui/toast'
  import { onMount } from 'svelte'
  import { currentUser, hasPermission } from '../lib/auth-store.svelte.js'
  import { desktopM as m } from '../lib/messages.svelte.js'
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
  useToastFeedback(() => currentServiceInfoError())
  useToastFeedback(() => currentEchoError())
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title={m('nav_dashboard')} description={m('dashboard_description')} />

  {#if me}
    <Card title={m('welcome', { name: me.username })}>
      <p class='text-sm opacity-70'>{m('dashboard_signed_in')}</p>

      {#snippet footer()}
        <div class='flex justify-end gap-2'>
          <Button variant='ghost' size='sm' onclick={() => void refreshServiceInfo()}>
            {m('refresh_service')}
          </Button>
          {#if hasPermission('user:list')}
            <Button variant='primary' size='sm' onclick={() => navigate('/users')}>
              {m('browse_users')}
            </Button>
          {/if}
        </div>
      {/snippet}
    </Card>
  {/if}

  <Card title={m('service_status')}>
    {#if isServiceInfoLoading()}
      <p class='text-sm opacity-70'>{m('service_loading')}</p>
    {:else if currentServiceInfoError()}
      <p class='text-sm text-base-content/60'>{m('service_failed')}</p>
    {:else if currentServiceInfo()}
      <div class='grid gap-3 md:grid-cols-2'>
        <div>
          <p class='text-sm opacity-60'>{m('service_name')}</p>
          <p class='font-medium'>{currentServiceInfo()?.name}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>{m('version')}</p>
          <p class='font-medium'>{currentServiceInfo()?.version}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>{m('transport')}</p>
          <p class='font-medium'>{currentServiceInfo()?.transportEnabled ? m('enabled') : m('disabled')}</p>
        </div>
        <div>
          <p class='text-sm opacity-60'>{m('uptime')}</p>
          <p class='font-medium'>{m('seconds', { count: Math.round((currentServiceInfo()?.uptimeMs ?? 0) / 1000) })}</p>
        </div>
      </div>
    {/if}
  </Card>

  <Card title={m('echo_title')}>
    <div class='flex flex-col gap-3'>
      <label class='form-control w-full'>
        <span class='label-text text-sm opacity-70'>{m('message')}</span>
        <input
          bind:value={message}
          class='input input-bordered w-full'
          maxlength='2000'
          placeholder={m('echo_placeholder')}
        />
      </label>

      <div class='flex justify-end'>
        <Button variant='primary' size='sm' loading={isEchoLoading()} onclick={handleEcho}>
          {m('echo_send')}
        </Button>
      </div>

      {#if currentEchoResult()}
        <div class='bg-base-200 rounded-box grid gap-3 p-4 md:grid-cols-2'>
          <div>
            <p class='text-sm opacity-60'>{m('echo_result')}</p>
            <p class='font-medium'>{currentEchoResult()?.message}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>{m('user_id')}</p>
            <p class='font-medium break-all'>{currentEchoResult()?.userId}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>{m('request_id')}</p>
            <p class='font-medium break-all'>{currentEchoResult()?.requestId}</p>
          </div>
          <div>
            <p class='text-sm opacity-60'>{m('timestamp')}</p>
            <p class='font-medium'>{currentEchoResult()?.timestamp}</p>
          </div>
        </div>
      {/if}
    </div>
  </Card>

  <Alert variant='info'>
    {m('dashboard_contract')}
  </Alert>
</div>
