<script lang='ts'>
  // AI 实验台首页：加载能力状态，编排对话、记忆、语音合成、麦克风实时转写与文件转写面板
  import type { LabStatus } from '$lib/ai-lab-types.js'
  import AsrPanel from '$lib/components/AsrPanel.svelte'
  import ChatPanel from '$lib/components/ChatPanel.svelte'
  import ImagePanel from '$lib/components/ImagePanel.svelte'
  import MemoryPanel from '$lib/components/MemoryPanel.svelte'
  import MicAsrPanel from '$lib/components/MicAsrPanel.svelte'
  import TtsPanel from '$lib/components/TtsPanel.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { loadStatus } from '$lib/services/ai-lab.js'

  let profileId = $state('demo-user')
  let status = $state<LabStatus | undefined>()
  let statusError = $state('')
  let memoryRefreshToken = $state(0)

  $effect(() => {
    void loadStatus()
      .then((value) => {
        status = value
        statusError = ''
      })
      .catch((cause: unknown) => {
        const detail = cause instanceof Error ? cause.message : m.error_unknown()
        statusError = m.error_request({ detail })
      })
  })
</script>

<svelte:head>
  <title>{m.page_title()}</title>
  <meta name='description' content={m.page_description()} />
</svelte:head>

<main class='mx-auto max-w-7xl px-4 py-8 lg:px-8 lg:py-10'>
  <section class='mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end'>
    <div class='max-w-3xl'>
      <div class='mb-3 flex items-center gap-2 text-sm font-medium text-primary'>
        <span class='h-px w-8 bg-primary'></span>
        {m.hero_eyebrow()}
      </div>
      <h1 class='text-3xl font-bold tracking-tight sm:text-4xl'>{m.hero_title()}</h1>
      <p class='mt-3 max-w-2xl text-base leading-7 text-base-content/60'>{m.hero_description()}</p>
    </div>

    <div class='flex min-w-72 flex-col gap-2 rounded-2xl border border-base-content/8 bg-base-100/75 p-4 shadow-sm'>
      <label class='text-xs font-semibold uppercase tracking-wider text-base-content/45' for='profile-id'>{m.profile_label()}</label>
      <input id='profile-id' class='input input-bordered input-sm w-full bg-base-100' bind:value={profileId} maxlength='64' />
      <p class='text-xs text-base-content/45'>{m.profile_hint()}</p>
    </div>
  </section>

  <section class='mb-6 grid grid-cols-2 gap-3 md:grid-cols-6' aria-label={m.status_title()}>
    <div class='col-span-2 rounded-2xl border border-base-content/8 bg-base-100/80 p-4 md:col-span-1'>
      <div class='text-xs text-base-content/45'>{m.status_connection()}</div>
      <div class='mt-2 flex items-center gap-2 font-semibold' data-testid='connection-status'>
        <span class='size-2 rounded-full' class:bg-success={status?.ready} class:bg-error={!status?.ready}></span>
        {status?.ready ? m.status_ready() : m.status_loading()}
      </div>
    </div>
    <div class='rounded-2xl border border-base-content/8 bg-base-100/80 p-4'>
      <div class='text-xs text-base-content/45'>{m.status_llm()}</div>
      <div class='mt-2 truncate font-mono text-sm font-semibold'>{status?.llmModel ?? '—'}</div>
    </div>
    <div class='rounded-2xl border border-base-content/8 bg-base-100/80 p-4'>
      <div class='text-xs text-base-content/45'>{m.status_tts()}</div>
      <div class='mt-2 truncate font-mono text-sm font-semibold'>{status?.ttsModel ?? '—'}</div>
    </div>
    <div class='rounded-2xl border border-base-content/8 bg-base-100/80 p-4'>
      <div class='text-xs text-base-content/45'>{m.status_asr()}</div>
      <div class='mt-2 truncate font-mono text-sm font-semibold'>{status?.asrModel ?? '—'}</div>
    </div>
    <div class='rounded-2xl border border-base-content/8 bg-base-100/80 p-4'>
      <div class='text-xs text-base-content/45'>{m.status_memory()}</div>
      <div class='mt-2 font-semibold'>{m.status_memory_ephemeral()}</div>
    </div>
    <div class='rounded-2xl border border-base-content/8 bg-base-100/80 p-4'>
      <div class='text-xs text-base-content/45'>{m.status_image()}</div>
      <div class='mt-2 truncate font-mono text-sm font-semibold'>{status?.imageModel ?? '—'}</div>
    </div>
  </section>

  {#if statusError}
    <div class='alert alert-error mb-5' role='alert'>{statusError}</div>
  {/if}

  <div class='lab-grid'>
    <ChatPanel {profileId} onmemorychange={() => memoryRefreshToken += 1} />
    <aside class='space-y-5'>
      <MemoryPanel {profileId} refreshToken={memoryRefreshToken} />
      <ImagePanel />
      <TtsPanel voices={status?.ttsVoices ?? []} />
      <MicAsrPanel />
      <AsrPanel />
    </aside>
  </div>
</main>
