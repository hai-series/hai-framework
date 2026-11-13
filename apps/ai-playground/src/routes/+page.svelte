<script lang='ts'>
  import type { LabStatus } from '#lib/ai-lab-types.js'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { errorMessage, useToastFeedback } from '@h-ai/ui/toast'
  import ApiGuide from '#lib/components/ApiGuide.svelte'
  import AsrPanel from '#lib/components/AsrPanel.svelte'
  import ChatPanel from '#lib/components/ChatPanel.svelte'
  import DemoWorkbench from '#lib/components/DemoWorkbench.svelte'
  import ImagePanel from '#lib/components/ImagePanel.svelte'
  import { labSections } from '#lib/components/lab-catalog.js'
  import MemoryPanel from '#lib/components/MemoryPanel.svelte'
  import MicAsrPanel from '#lib/components/MicAsrPanel.svelte'
  import TtsPanel from '#lib/components/TtsPanel.svelte'
  import * as m from '#lib/paraglide/messages.js'
  import { loadStatus } from '#lib/services/ai-lab.js'
  import { loadDemoAvailability } from '#lib/services/demo.js'

  const active = $derived(labSections.find(section => section.id === page.url.searchParams.get('section')) ?? labSections[0])
  let profileId = $state('demo-user')
  let status = $state<LabStatus>()
  let statusError = $state('')
  let demoError = $state(false)
  let unavailable = $state<Record<string, string>>({})
  let memoryRefreshToken = $state(0)
  const setup = [
    { title: m.lab_setup_runtime, description: m.lab_setup_runtime_body, source: 'Node.js · pnpm · SvelteKit' },
    { title: m.lab_setup_config, description: m.lab_setup_config_body, source: 'config/_ai.yml · .env.local' },
    { title: m.lab_setup_storage, description: m.lab_setup_storage_body, source: 'RelDB → VecDB → AI' },
    { title: m.lab_setup_services, description: m.lab_setup_services_body, source: 'Redis · Podman / Docker' },
  ]
  const modelStatus = $derived([
    {
      title: m.status_llm(),
      value: status?.llmModel,
    },
    {
      title: m.status_tts(),
      value: status?.ttsModel,
    },
    {
      title: m.status_asr(),
      value: status?.asrModel,
    },
    {
      title: m.status_image(),
      value: status?.imageModel,
    },
  ])

  $effect(() => {
    const controller = new AbortController()
    void loadStatus().then((value) => {
      if (!controller.signal.aborted)
        status = value
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        statusError = m.error_request({
          detail: errorMessage(cause, m.error_unknown()),
        })
      }
    })
    void loadDemoAvailability(controller.signal).then((value) => {
      unavailable = value
    }).catch(() => {
      if (!controller.signal.aborted)
        demoError = true
    })
    return () => controller.abort()
  })
  useToastFeedback(() => statusError)
</script>

<svelte:head>
  <title>{m.page_title()}</title>
  <meta name='description' content={m.page_description()} />
</svelte:head>

<main class='lab-shell w-full min-w-0'>
  <aside class='lab-rail border-base-content/10 bg-base-100'>
    <nav aria-label={m.lab_nav_label()} class='lab-nav'>
      {#each labSections as section (section.id)}
        <a
          href={resolve(section.id === 'setup'
            ? '/'
            : `/?section=${section.id}`)}
          data-testid={`lab-nav-${section.id}`}
          aria-current={section.id === active.id
            ? 'page'
            : undefined}
          class='flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-base-content/75 hover:bg-base-200 aria-[current=page]:bg-primary/10 aria-[current=page]:font-semibold aria-[current=page]:text-primary'
        >
          <span class={`${section.icon} size-[1.1rem] shrink-0`} aria-hidden='true'></span>
          {section.title()}
        </a>
      {/each}
    </nav>
    <div class='lab-service'>
      <span class='text-xs text-base-content/60'>{m.status_connection()}</span>
      <span class='mt-1.5 flex items-center gap-2 text-sm font-semibold' data-testid='connection-status'>
        <span class='size-2 rounded-full' class:bg-success={status?.ready} class:bg-error={statusError} class:bg-warning={!status?.ready && !statusError}></span>
        {statusError
          ? m.lab_service_failed()
          : status?.ready
          ? m.status_ready()
          : m.status_loading()}
      </span>
    </div>
  </aside>

  <section class='lab-content min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9' aria-labelledby='lab-section-title'>
    <header class='mb-6 max-w-4xl'>
      <h1 id='lab-section-title' class='text-2xl font-bold tracking-tight sm:text-3xl'>{active.title()}</h1>
      <p class='mt-2 text-sm leading-6 text-base-content/70 sm:text-base'>{active.description()}</p>
    </header>

    {#if active.id === 'setup'}
      <div data-testid='setup-guide' class='grid gap-4 md:grid-cols-2'>
        {#each setup as item (item.source)}
          <section class='rounded-2xl border border-base-content/10 bg-base-100 p-5 sm:p-6'>
            <h2 class='text-base font-semibold'>{item.title()}</h2>
            <p class='mt-2 text-sm leading-6 text-base-content/70'>{item.description()}</p>
            <p class='mt-3 font-mono text-xs wrap-anywhere text-primary'>{item.source}</p>
          </section>
        {/each}
      </div>
      <ApiGuide id='setup-panel' />
      <section class='mt-5 rounded-2xl border border-base-content/10 bg-base-100 p-5 sm:p-6' aria-label={m.status_title()}>
        <h2 class='text-base font-semibold'>{m.status_title()}</h2>
        <dl class='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {#each modelStatus as model (model.title)}
            <div class='min-w-0 rounded-lg bg-base-200 px-3 py-2.5'>
              <dt class='text-xs text-base-content/65'>{model.title}</dt>
              <dd class='mt-1 font-mono text-sm wrap-anywhere'>{model.value ?? '—'}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {:else if active.id === 'media'}
      <p class='mb-5 rounded-lg border border-base-content/10 bg-base-100 px-4 py-3 text-sm leading-6 text-base-content/75'>{m.lab_media_config()}</p>
      <div class='grid min-w-0 gap-5 xl:grid-cols-2'>
        <ImagePanel />
        <TtsPanel voices={status?.ttsVoices ?? []} />
        <AsrPanel />
        <MicAsrPanel />
      </div>
      <div class='mt-5'><DemoWorkbench section='media' {unavailable} /></div>
    {:else}
      {#if active.id === 'models' || active.id === 'context'}
        <div class='mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-base-content/10 bg-base-100 px-4 py-3'>
          <label class='text-sm font-medium' for='profile-id'>{m.profile_label()}</label>
          <input id='profile-id' class='input input-bordered input-sm max-w-full bg-base-100 sm:w-44' bind:value={profileId} maxlength='64' />
          <p class='text-xs leading-5 text-base-content/65'>{m.profile_hint()} {status?.memoryMode === 'persistent'
            ? m.memory_persistent_hint()
            : status?.memoryMode === 'ephemeral'
            ? m.memory_ephemeral_hint()
            : ''}</p>
        </div>
      {/if}
      {#if demoError}
        <p class='mb-4 text-sm text-error' role='alert'>{m.demo_request_failed()}</p>
      {/if}
      {#key active.id}
        <DemoWorkbench section={active.id} {unavailable} />
      {/key}
      {#if active.id === 'models'}
        <div class='mt-5'><ChatPanel {profileId} onmemorychange={() => memoryRefreshToken += 1} /></div>
      {:else if active.id === 'context'}
        <div class='mt-5'>
          <p class='mb-3 text-sm leading-6 text-base-content/70'>{m.lab_memory_config()}</p>
          <MemoryPanel {profileId} refreshToken={memoryRefreshToken} memoryMode={status?.memoryMode} />
        </div>
      {/if}
    {/if}
  </section>
</main>
