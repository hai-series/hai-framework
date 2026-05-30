<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { currentUser, hasPermission } from '$lib/stores/auth-store.svelte.js'
  import {
    currentEchoError,
    currentEchoResult,
    currentServiceInfo,
    currentServiceInfoError,
    isEchoLoading,
    isServiceInfoLoading,
    refreshServiceInfo,
    sendEcho,
  } from '$lib/stores/service-status.svelte.js'
  import { onMount } from 'svelte'

  const me = $derived(currentUser())
  let message = $state(m.dashboard_echo_default())

  onMount(() => {
    void refreshServiceInfo()
  })

  async function handleRefresh(): Promise<void> {
    await refreshServiceInfo()
  }

  async function handleEcho(): Promise<void> {
    const trimmed = message.trim()
    if (!trimmed)
      return

    await sendEcho(trimmed)
  }
</script>

<svelte:head>
  <title>{m.dashboard_title()} - {m.app_title()}</title>
</svelte:head>

<PullRefresh onrefresh={handleRefresh}>
  <div class='space-y-4 p-4 pb-6'>
    <section class='bg-primary text-primary-content rounded-2xl p-5 shadow-sm'>
      <div class='flex items-start justify-between gap-4'>
        <div>
          <p class='text-sm opacity-75'>{m.dashboard_welcome_prefix()}</p>
          <h1 class='mt-1 text-2xl font-bold'>{me?.username ?? m.dashboard_guest()}</h1>
          <p class='mt-2 text-sm opacity-80'>{m.dashboard_subtitle()}</p>
        </div>
        <span class='icon-[tabler--device-mobile-code] text-4xl opacity-80'></span>
      </div>
    </section>

    <div class='grid grid-cols-2 gap-3'>
      <Card padding='sm' shadow='sm'>
        <div class='flex flex-col gap-2'>
          <span class='icon-[tabler--shield-lock] text-primary text-2xl'></span>
          <span class='text-sm font-medium'>{m.dashboard_secure_token_title()}</span>
          <span class='text-base-content/60 text-xs'>{m.dashboard_secure_token_desc()}</span>
        </div>
      </Card>
      <Card padding='sm' shadow='sm'>
        <div class='flex flex-col gap-2'>
          <span class='icon-[tabler--api-app] text-primary text-2xl'></span>
          <span class='text-sm font-medium'>{m.dashboard_contract_title()}</span>
          <span class='text-base-content/60 text-xs'>{m.dashboard_contract_desc()}</span>
        </div>
      </Card>
    </div>

    <Card title={m.service_card_title()} shadow='sm'>
      {#if isServiceInfoLoading()}
        <div class='flex items-center gap-2 text-sm opacity-70'>
          <span class='loading loading-spinner loading-sm'></span>
          {m.common_loading()}
        </div>
      {:else if currentServiceInfoError()}
        <Alert variant='error' title={m.service_error_title()}>
          {currentServiceInfoError()}
        </Alert>
      {:else if currentServiceInfo()}
        <div class='grid grid-cols-2 gap-3 text-sm'>
          <div>
            <p class='text-base-content/50'>{m.service_name_label()}</p>
            <p class='font-medium'>{currentServiceInfo()?.name}</p>
          </div>
          <div>
            <p class='text-base-content/50'>{m.service_version_label()}</p>
            <p class='font-medium'>{currentServiceInfo()?.version}</p>
          </div>
          <div>
            <p class='text-base-content/50'>{m.service_transport_label()}</p>
            <Badge variant={currentServiceInfo()?.transportEnabled ? 'success' : 'warning'} size='sm'>
              {currentServiceInfo()?.transportEnabled ? m.common_enabled() : m.common_disabled()}
            </Badge>
          </div>
          <div>
            <p class='text-base-content/50'>{m.service_uptime_label()}</p>
            <p class='font-medium'>{Math.round((currentServiceInfo()?.uptimeMs ?? 0) / 1000)}s</p>
          </div>
        </div>
      {/if}

      {#snippet footer()}
        <Button variant='ghost' size='sm' onclick={() => void refreshServiceInfo()}>
          {m.common_refresh()}
        </Button>
      {/snippet}
    </Card>

    <Card title={m.echo_card_title()} shadow='sm'>
      <div class='space-y-3'>
        <label class='fieldset w-full'>
          <span class='fieldset-legend font-medium'>{m.echo_message_label()}</span>
          <Input bind:value={message} maxlength={2000} />
        </label>
        <Button variant='primary' size='sm' loading={isEchoLoading()} class='w-full' onclick={handleEcho}>
          {m.echo_send()}
        </Button>

        {#if currentEchoError()}
          <Alert variant='error' title={m.echo_error_title()}>
            {currentEchoError()}
          </Alert>
        {/if}

        {#if currentEchoResult()}
          <div class='bg-base-200 rounded-xl p-3 text-sm'>
            <p class='text-base-content/50'>{m.echo_result_label()}</p>
            <p class='mt-1 font-medium break-all'>{currentEchoResult()?.message}</p>
            <p class='text-base-content/50 mt-3'>{m.echo_request_label()}</p>
            <p class='mt-1 break-all'>{currentEchoResult()?.requestId}</p>
          </div>
        {/if}
      </div>
    </Card>

    {#if hasPermission('user:list')}
      <Button variant='primary' outline class='w-full' onclick={() => goto(resolve('/users', {}))}>
        <span class='icon-[tabler--users] text-lg'></span>
        {m.dashboard_users_action()}
      </Button>
    {/if}
  </div>
</PullRefresh>
