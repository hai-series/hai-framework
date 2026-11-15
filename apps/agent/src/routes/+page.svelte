<script lang='ts'>
  import type { CodeWorkspaceSource } from '@h-ai/ui'
  import type { HomeView, KnowledgeView, TaskView } from '#lib/client.js'
  import type { AgentResource, AgentTask, AgentTurn, WorkspaceAction, WorkspaceEntry } from '#lib/workspace.js'
  import type { PageProps } from './$types'
  import { resolve } from '$app/paths'
  import { CodeWorkspace, Confirm, LanguageSwitch, MarkdownRenderer, ThemeToggle, WorkspaceLayout } from '@h-ai/ui'
  import { onDestroy, onMount } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { AgentClientError, read, record, send, speak, transcribe, upload } from '#lib/client.js'
  import Library from '#lib/components/Library.svelte'
  import TaskSettings from '#lib/components/TaskSettings.svelte'
  import * as m from '#lib/paraglide/messages.js'
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js'

  const { data, form }: PageProps = $props()
  type Pane = 'workspace' | 'personal' | 'memory' | 'knowledge' | 'files' | 'permissions' | 'settings'
  const labels = {
    workspace: m.workspace,
    personal: m.personal,
    memory: m.memory,
    knowledge: m.knowledge,
    files: m.files,
    permissions: m.permissions,
    settings: m.settings,
  }
  const tabs = {
    activity: m.activity,
    sources: m.sources,
    artifacts: m.artifacts,
    changes: m.changes,
  }
  const modes: Record<string, () => string> = {
    auto: m.mode_auto,
    shared: m.mode_shared,
    user: m.mode_user,
    task: m.mode_task,
  }
  const reasons: Record<string, () => string> = {
    'explicit': m.plan_explicit,
    'user-policy': m.plan_user,
    'verified-shared': m.plan_shared,
    'isolated-default': m.plan_task,
  }
  const statuses: Record<string, () => string> = {
    submitting: m.submitting,
    queued: m.queued,
    running: m.running,
    cancelling: m.cancelling,
    succeeded: m.succeeded,
    failed: m.failed,
    cancelled: m.cancelled,
    unknown: m.unknown,
  }
  const approvalActions = {
    'allow-once': m.allow_once,
    'allow-session': m.allow_session,
    'always-allow': m.always_allow,
    'deny': m.deny,
  } as const
  const live = new Set([
    'submitting',
    'queued',
    'running',
    'cancelling',
  ])
  let pane = $state<Pane>('workspace')
  let tab = $state<keyof typeof tabs>('activity')
  let home = $state<HomeView>()
  let task = $state<AgentTask>()
  let turns = $state<AgentTurn[]>([])
  let entries = $state<WorkspaceEntry[]>([])
  let attachments = $state<AgentResource[]>([])
  let knowledge = $state<KnowledgeView[]>([])
  let chosenKnowledge = $state<string[]>([])
  let chosenSkills = $state<string[]>([])
  let useMemory = $state(false)
  let audioStop = $state<(() => void)>()
  let speaking = $state(false)
  let recording = $state(false)
  let player: HTMLAudioElement | undefined
  let audioAbort: AbortController | undefined
  let audioURL: string | undefined
  let selection = $state('')
  let draft = $state('')
  let query = $state('')
  let errorText = $state('')
  let pending = $state(false)
  let rename = $state(false)
  let renameTitle = $state('')
  let showResults = $state(false)
  let showTasks = $state(false)
  let acknowledged = $state<string[]>([])
  let archived = $state(false)
  let preview = $state<{ title: string, patch: string, files: string[], project: string }>()
  let previewId = $state('')
  let publishResult = $state('')
  let confirmPublish = $state(false)
  let publishing = $state(false)
  let attachmentInput = $state<HTMLInputElement>()
  let audioInput = $state<HTMLInputElement>()
  let feed = $state<HTMLElement>()
  let observer: AbortController | undefined
  let cursor = 0
  let offset = 0
  let receipt: string | undefined
  let poll: ReturnType<typeof setTimeout> | undefined
  const lastTurn = $derived(turns.at(-1))
  const running = $derived(!!lastTurn && live.has(lastTurn.status))
  const titles = $derived(home?.tasks.filter(item => item.archived === archived && `${item.title || m.untitled()}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [])
  const seen = $derived([
    ...turns.flatMap(turn => turn.eventSummary ?? []),
    ...entries,
  ])
  const artifacts = $derived([
    ...new SvelteMap(seen.filter(item => item.type === 'artifact' && item.id).map(item => [item.id, item])).values(),
  ])
  const sources = $derived([
    ...new SvelteMap(seen.filter(item => item.type === 'citation').map(item => [item.id, item])).values(),
  ])
  const tools = $derived(combineTools(seen))
  const approvals = $derived(running
    ? entries.filter(item => item.type === 'approval' && item.approvalId && !acknowledged.includes(item.approvalId))
    : [])
  const usage = $derived(seen.findLast(item => item.type === 'usage'))
  const streamed = $derived(entries.filter(item => item.type === 'text').map(item => item.text).join(''))
  const patchSource = $derived<CodeWorkspaceSource | undefined>(preview
    ? {
      listChildren: () => [
        { kind: 'file', id: previewId, name: preview?.title ?? 'workspace.patch' },
      ],
      readFile: () => ({ text: preview?.patch ?? '', language: 'diff' }),
    }
    : undefined)

  function combineTools(value: WorkspaceEntry[]) {
    const result = new SvelteMap<string, WorkspaceEntry>()
    for (const item of value) {
      if (item.type === 'tool' && item.id) {
        result.set(item.id, {
          ...result.get(item.id),
          ...item,
        })
      }
    }
    return [
      ...result.values(),
    ]
  }

  function problem(error: unknown) {
    if (error instanceof AgentClientError) {
      const localized: Record<string, () => string> = {
        'busy': m.busy,
        'archived': m.archived,
        'missing': m.not_found,
        'invalid': m.invalid,
        'file-type': m.file_type,
        'context-budget': m.budget,
        'backend-unavailable': m.backend_offline,
        'hai:ai:075': m.incompatible,
        'hai:ai:083': m.incompatible,
        'hai:ai:073': m.not_found,
      }
      errorText = localized[error.code]?.() ?? m.operation_failed()
      return
    }
    errorText = m.operation_failed()
  }

  async function bootstrap() {
    home = await read<HomeView>()
  }

  async function openTask(id: string) {
    observer?.abort()
    clearTimeout(poll)
    observer = new AbortController()
    if (selection !== id) {
      draft = ''
      attachments = []
      chosenKnowledge = []
      chosenSkills = []
      useMemory = home?.preferences.memoryRead ?? false
      audioStop?.()
      audioStop = undefined
      recording = false
      stopSpeech()
    }
    selection = id
    task = undefined
    turns = []
    entries = []
    acknowledged = []
    preview = undefined
    cursor = 0
    offset = 0
    receipt = undefined
    pane = 'workspace'
    showTasks = false
    if (id) {
      sessionStorage.setItem('agent-active-task', id)
      await refresh(id, observer.signal)
    }
  }

  async function refresh(id: string, signal = observer?.signal, latest = false) {
    if (signal?.aborted || !id || id !== selection)
      return
    try {
      const result = await read<TaskView>({
        task: id,
        after: String(cursor),
        ...(latest
          ? { latest: '1' }
          : {}),
      }, signal)
      if (signal?.aborted || id !== selection)
        return
      const tail = result.turns.at(-1)
      if (latest && tail?.id !== turns.at(-1)?.id) {
        await refresh(id, signal)
        return
      }
      const restart = tail?.receipt !== receipt && cursor > 0
      if (tail?.receipt !== receipt) {
        receipt = tail?.receipt
        cursor = 0
        entries = []
      }
      task = result.task
      turns = offset || latest
        ? [
          ...turns.filter(turn => !result.turns.some(current => current.id === turn.id)),
          ...result.turns,
        ]
        : result.turns
      if (!restart && result.events.length) {
        cursor = result.events.at(-1)!.sequence
        entries = [
          ...entries,
          ...result.events.map(item => item.data),
        ]
      }
      if (!tail || !live.has(tail.status)) {
        entries = []
        clearTimeout(poll)
        return
      }
      clearTimeout(poll)
      poll = setTimeout(() => {
        void refresh(id, signal, true)
      }, restart || result.events.length === 100
        ? 0
        : 700)
    }
    catch (error) {
      if (!signal?.aborted) {
        problem(error)
        if (!(error instanceof AgentClientError) || error.status >= 500)
          poll = setTimeout(() => { void refresh(id, signal, latest) }, 1400)
      }
    }
  }

  async function older() {
    if (!selection)
      return
    const next = await read<TaskView>({
      task: selection,
      offset: String(40 + offset),
    })
    if (next.turns.length) {
      offset += 40
      turns = [
        ...next.turns,
        ...turns,
      ]
    }
  }

  onMount(() => {
    if (!data.user)
      return
    void bootstrap().then(async () => {
      const previous = sessionStorage.getItem('agent-active-task')
      if (previous && home?.tasks.some(item => item.id === previous && !item.archived))
        await openTask(previous)
    }).catch(problem)
  })

  onDestroy(() => {
    observer?.abort()
    clearTimeout(poll)
    audioStop?.()
    stopSpeech()
  })

  async function newTask() {
    errorText = ''
    try {
      const id = crypto.randomUUID()
      const created = await send<AgentTask>({ type: 'new', id })
      if (home)
        home.tasks = [created, ...home.tasks]
      await openTask(id)
    }
    catch (error) { problem(error) }
  }

  async function submit(text = draft) {
    if (!text.trim() || !selection || pending || running)
      return
    const id = selection
    const signal = observer?.signal
    pending = true
    errorText = ''
    try {
      await send({
        type: 'send',
        task: id,
        turn: crypto.randomUUID(),
        text: text.trim(),
        files: attachments.map(file => file.id),
        knowledge: chosenKnowledge,
        skills: chosenSkills,
        memory: useMemory,
      })
      if (signal?.aborted)
        return
      draft = ''
      await refresh(id, signal)
      await bootstrap()
      requestAnimationFrame(() => feed?.scrollTo({ top: feed?.scrollHeight }))
    }
    catch (error) {
      if (!signal?.aborted) {
        problem(error)
        await refresh(id, signal)
      }
    }
    finally { pending = false }
  }

  async function change(action: WorkspaceAction) {
    errorText = ''
    try {
      await send(action)
      await refresh(selection)
      await bootstrap()
    }
    catch (error) { problem(error) }
  }

  async function showKnowledge() {
    try {
      knowledge = await read<KnowledgeView[]>({ pane: 'knowledge' })
    }
    catch (error) { problem(error) }
  }

  async function attach(event: Event) {
    if (!(event.currentTarget instanceof HTMLInputElement))
      return
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file)
      return
    const signal = observer?.signal
    try {
      const uploaded = await upload(file)
      if (!signal?.aborted)
        attachments = [...attachments, uploaded].slice(0, 8)
    }
    catch (error) {
      if (!signal?.aborted)
        problem(error)
    }
  }

  async function addSpeech(blob: Blob, signal = observer?.signal) {
    try {
      const result = await transcribe(blob)
      if (signal?.aborted)
        return
      draft = draft
        ? `${draft} ${result.text}`
        : result.text
    }
    catch (error) {
      if (!signal?.aborted)
        problem(error)
    }
  }

  async function voiceInput(event: Event) {
    if (!(event.currentTarget instanceof HTMLInputElement))
      return
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file)
      await addSpeech(file)
  }

  async function voiceRecord() {
    if (audioStop) {
      audioStop()
      return
    }
    const signal = observer?.signal
    try {
      const stop = await record((audio) => {
        if (signal?.aborted)
          return
        audioStop = undefined
        recording = false
        void addSpeech(audio, signal)
      })
      if (signal?.aborted) {
        stop()
        return
      }
      audioStop = stop
      recording = true
    }
    catch (error) {
      if (!signal?.aborted)
        problem(error)
    }
  }

  function stopSpeech() {
    audioAbort?.abort()
    player?.pause()
    player = undefined
    if (audioURL)
      URL.revokeObjectURL(audioURL)
    audioURL = undefined
    speaking = false
  }

  async function readAnswer(text: string) {
    stopSpeech()
    try {
      const request = new AbortController()
      audioAbort = request
      speaking = true
      const result = await speak(text.slice(0, 5000), home?.preferences.voice ?? '', request.signal)
      if (request.signal.aborted)
        return
      audioURL = URL.createObjectURL(result)
      player = new Audio(audioURL)
      player.onended = stopSpeech
      await player.play()
    }
    catch (error) {
      if (audioAbort?.signal.aborted)
        return
      stopSpeech()
      problem(error)
    }
  }

  async function allow(id: string, decision: keyof typeof approvalActions) {
    try {
      await send({ type: 'approval', id, decision })
      acknowledged = [...acknowledged, id]
    }
    catch (error) { problem(error) }
  }

  async function inspect(id: string) {
    try {
      preview = await read({ preview: id })
      previewId = id
      publishResult = ''
      tab = 'changes'
      showResults = true
    }
    catch (error) { problem(error) }
  }

  async function publish() {
    if (!previewId)
      return
    publishing = true
    try {
      const result = await send<{ branch: string }>({ type: 'publish', id: previewId })
      publishResult = `${m.published()} · ${result.branch}`
    }
    catch (error) { problem(error) }
    finally { publishing = false }
  }
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

{#if !data.user}
  <main class='agent-rail grid min-h-dvh place-items-center p-5'>
    <section class='agent-shadow w-full max-w-sm rounded-2xl border agent-divider bg-base-100 p-7 sm:p-9'>
      <div class='mb-6 flex items-center gap-3'>
        <span class='agent-mark' aria-hidden='true'><span class='icon-[tabler--terminal-2] text-lg'></span></span>
        <h1 class='text-2xl font-semibold tracking-tight'>{m.app_name()}</h1>
      </div>
      <form method='POST' action='?/login' class='grid gap-4'>
        <label class='grid gap-1.5 text-sm font-medium'>{m.username()}<input name='username' class='input w-full' autocomplete='username' required minlength='3' maxlength='100' /></label>
        <label class='grid gap-1.5 text-sm font-medium'>{m.password()}<input type='password' name='password' class='input w-full' autocomplete='current-password' required maxlength='128' /></label>
        {#if form?.error}<p role='alert' class='text-sm text-error'>{m.credentials()}</p>{/if}
        <button class='btn btn-primary w-full' name='operation' value='login'>{m.login()}</button>
        {#if data.registration}<button class='btn btn-ghost w-full' name='operation' value='signup'>{m.signup()}</button>{/if}
      </form>
    </section>
  </main>
{:else}
  <div class='relative flex min-h-dvh flex-col overflow-hidden lg:h-dvh lg:flex-row'>
    <aside aria-label={m.task_history()} class="agent-rail w-full shrink-0 flex-col border-b lg:w-[248px] lg:border-r lg:border-b-0 agent-divider {showTasks ? 'flex' : 'hidden lg:flex'}">
      <div class='flex items-center gap-2.5 px-4 py-4'>
        <span class='agent-mark' aria-hidden='true'><span class='icon-[tabler--terminal-2] text-lg'></span></span>
        <span class='text-base font-semibold tracking-tight'>{m.app_name()}</span>
      </div>
      <div class='px-3 pb-3'>
        <button class='btn btn-primary btn-sm w-full justify-start' disabled={!home} onclick={newTask}><span class='icon-[tabler--plus] agent-icon'></span>{m.new_task()}</button>
      </div>
      <nav class='grid gap-0.5 px-3 pb-4 text-sm' aria-label={m.workspace()}>
        {#each [
          { id: 'workspace', icon: 'icon-[tabler--layout-sidebar]' },
          { id: 'knowledge', icon: 'icon-[tabler--books]' },
          { id: 'memory', icon: 'icon-[tabler--brain]' },
          { id: 'files', icon: 'icon-[tabler--paperclip]' },
          { id: 'personal', icon: 'icon-[tabler--adjustments]' },
          { id: 'permissions', icon: 'icon-[tabler--shield-check]' },
        ] as item (item.id)}
          <button class:btn-active={pane === item.id} class='btn btn-ghost btn-sm justify-start' disabled={!home} onclick={() => {
            pane = item.id as Pane
            showTasks = false
          }}><span class={`${item.icon} agent-icon`}></span>{labels[item.id as keyof typeof labels]()}</button>
        {/each}
      </nav>
      <div class='flex min-h-0 flex-1 flex-col border-t agent-divider px-3 py-3'>
        <div class='mb-2 flex items-center justify-between'>
          <h2 class='agent-muted text-xs font-semibold uppercase tracking-wide'>{archived
            ? m.archived()
            : m.task_history()}</h2>
          <button class='btn btn-square btn-ghost btn-xs' title={m.archived()} aria-label={m.archived()} aria-pressed={archived} onclick={() => { archived = !archived }}><span class='icon-[tabler--archive] agent-icon'></span></button>
        </div>
        <input class='input input-sm w-full' aria-label={m.search_tasks()} placeholder={m.search_tasks()} bind:value={query} />
        <div class='mt-2 grid content-start gap-0.5 overflow-auto'>
          {#each titles as item (item.id)}
            <button class:btn-active={selection === item.id} class='btn btn-ghost btn-sm w-full min-w-0 justify-start px-2' onclick={() => openTask(item.id)}>
              <span class='icon-[tabler--message-circle] agent-icon opacity-60'></span><span class='truncate'>{item.title || m.untitled()}</span>
            </button>
          {:else}<p class='agent-muted px-2 py-2 text-xs'>{m.empty_list()}</p>{/each}
        </div>
      </div>
      <form method='POST' action='?/logout' class='flex items-center justify-between border-t agent-divider px-3 py-3'>
        <span class='truncate text-sm font-medium'>{data.user.name}</span>
        <button class='btn btn-ghost btn-square btn-sm' title={m.logout()} aria-label={m.logout()}><span class='icon-[tabler--logout] agent-icon'></span></button>
      </form>
    </aside>

    <WorkspaceLayout class='min-h-dvh lg:min-h-0' title={pane === 'workspace'
      ? task?.title || m.workspace()
      : labels[pane]()}>
      {#snippet leading()}<button class='btn btn-square btn-ghost btn-sm lg:hidden' onclick={() => { showTasks = !showTasks }} aria-label={m.show_tasks()}><span class='icon-[tabler--menu-2] agent-icon'></span></button>{/snippet}
      {#snippet actions()}
        {#if task && pane === 'workspace'}
          <button class='btn btn-ghost btn-sm' onclick={() => { pane = 'settings' }} title={m.settings()} aria-label={m.settings()}><span class='icon-[tabler--settings] agent-icon'></span><span class='hidden sm:inline'>{m.settings()}</span></button>
          <div class='dropdown dropdown-end'>
            <button class='btn btn-ghost btn-square btn-sm' title={m.task_history()} aria-label={m.task_history()}><span class='icon-[tabler--dots] agent-icon'></span></button>
            <ul class='dropdown-content menu z-30 mt-2 w-36 rounded-box border agent-divider bg-base-100 p-1 shadow-lg'>
              <li><button onclick={() => {
                renameTitle = task?.title ?? ''
                rename = true
              }}>{m.rename()}</button></li>
              <li><button onclick={() => task && change({ type: 'archive', id: task.id, archived: !task.archived })}>{task.archived
                ? m.restore()
                : m.archive()}</button></li>
            </ul>
          </div>
        {/if}
        <LanguageSwitch currentLanguage={getLocale()} onchange={(value) => { void setLocale(value as ReturnType<typeof getLocale>) }} compact />
        <ThemeToggle />
        <button class='btn btn-square btn-ghost btn-sm xl:hidden' onclick={() => { showResults = !showResults }} aria-label={m.show_results()}><span class='icon-[tabler--layout-sidebar-right] agent-icon'></span></button>
      {/snippet}
      {#if errorText}
        <div role='alert' class='mx-auto mb-2 flex w-full max-w-4xl items-center gap-2 rounded-lg border border-error/30 bg-error/5 p-2 text-sm text-error'>
          <span class='flex-1'>{errorText}</span><button class='btn btn-ghost btn-xs' onclick={() => { errorText = '' }}>{m.close()}</button>
        </div>
      {/if}
      {#if !home}
        <div class='grid flex-1 place-items-center agent-muted'>{m.loading()}</div>
      {:else if pane === 'settings' && task}
        <TaskSettings {task} {home} onerror={problem} onclose={() => { pane = 'workspace' }} onsave={() => {
          pane = 'workspace'
          void refresh(selection)
        }} />
      {:else if pane !== 'workspace' && pane !== 'settings'}
        {#key pane}
          <Library {pane} {home} onerror={problem} onpreferences={(prefs) => {
            if (home)
              home.preferences = prefs
          }} />
        {/key}
      {:else}
        <div class='flex min-h-0 flex-1 flex-col'>
          <div class='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-auto px-2 pb-5 sm:px-5' bind:this={feed}>
            {#if !turns.length}
              <div class='mx-auto my-auto max-w-xl pb-6 pt-8 text-center'>
                <span class='agent-mark mx-auto mb-4' aria-hidden='true'><span class='icon-[tabler--terminal-2] text-lg'></span></span>
                <h2 class='text-2xl font-semibold tracking-tight sm:text-3xl'>{m.compose_title()}</h2>
                <p class='agent-muted mt-2 text-sm'>{m.compose_hint()}</p>
                {#if !task}<button class='btn btn-primary btn-sm mt-5 lg:hidden' onclick={newTask}>{m.new_task()}</button>{/if}
              </div>
            {:else}
              {#if turns.length >= 40}<button class='btn btn-ghost btn-xs self-center' onclick={() => { void older().catch(problem) }}>{m.older()}</button>{/if}
              {#each turns as turn (turn.id)}
                <article class='grid gap-4'>
                  <div class='agent-rail max-w-[92%] justify-self-end whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm'>{turn.text}</div>
                  {#if turn.output?.text || (turn.id === lastTurn?.id && streamed)}
                    <div class='min-w-0 text-sm leading-relaxed'>
                      <MarkdownRenderer content={turn.output?.text || streamed} />
                      {#if turn.output?.json}<pre class='overflow-auto rounded-lg border agent-divider p-3'>{JSON.stringify(turn.output.json, null, 2)}</pre>{/if}
                      {#if home.speech.tts && turn.output?.text}
                        <button class='btn btn-ghost btn-xs mt-2' onclick={() => speaking
                          ? stopSpeech()
                          : readAnswer(turn.output?.text ?? '')}><span class='icon-[tabler--volume] agent-icon'></span>{speaking
                          ? m.stop_audio()
                          : m.speak()}</button>
                      {/if}
                    </div>
                  {/if}
                  <div class='agent-muted flex flex-wrap items-center gap-2 text-xs'>
                    <span class='rounded-lg border agent-divider px-2 py-1' data-turn-status={turn.status}>{statuses[turn.status]?.() ?? turn.status}</span>
                    {#if turn.plan}<span>{turn.plan.modelId ?? ''} · {modes[turn.plan.resolvedMode]?.() ?? turn.plan.resolvedMode} · {reasons[turn.plan.reason]?.() ?? turn.plan.reason}</span>{/if}
                    {#if turn.compressed}<span>{m.compacted()}</span>{/if}
                    {#if turn.estimate}<span>{m.estimated()} {turn.estimate.used}{turn.estimate.size
                      ? ` / ${turn.estimate.size}`
                      : ''}</span>{/if}
                    {#if ['failed', 'cancelled', 'unknown'].includes(turn.status)}
                      <button class='btn btn-ghost btn-xs' onclick={() => { draft = turn.text }}>{m.retry()}</button>
                    {/if}
                  </div>
                </article>
              {/each}
            {/if}
            {#each approvals as event (event.approvalId)}
              {#if event.approvalId}
                <section class='rounded-xl border border-warning/40 bg-warning/10 p-3'>
                  <h3 class='font-semibold text-sm'><span class='icon-[tabler--shield-exclamation] agent-icon align-middle'></span> {m.approval_title()}</h3>
                  <pre class='my-2 whitespace-pre-wrap break-all text-xs'>{event.summary}</pre>
                  <div class='flex flex-wrap gap-1.5'>
                    {#each Object.entries(approvalActions) as [item, label] (item)}
                      <button class='btn btn-sm' onclick={() => allow(event.approvalId!, item as keyof typeof approvalActions)}>{label()}</button>
                    {/each}
                  </div>
                </section>
              {/if}
            {/each}
            {#if tools.length}
              <button class='btn btn-ghost btn-xs self-start' onclick={() => {
                tab = 'activity'
                showResults = true
              }}><span class='icon-[tabler--tool] agent-icon'></span>{m.activity()} <span>{tools.length}</span></button>
            {/if}
          </div>

          {#if task && !task.archived}
            <form class='agent-shadow mx-auto w-full max-w-3xl shrink-0 rounded-2xl border agent-divider bg-base-100 p-3' onsubmit={(event) => {
              event.preventDefault()
              void submit()
            }}>
              {#if attachments.length}
                <div class='mb-2 flex flex-wrap gap-1'>
                  {#each attachments as file (file.id)}
                    <button type='button' class='btn btn-sm btn-ghost border agent-divider' onclick={() => { attachments = attachments.filter(item => item.id !== file.id) }}><span class='icon-[tabler--paperclip] agent-icon'></span>{file.title}<span class='icon-[tabler--x] agent-icon'></span></button>
                  {/each}
                </div>
              {/if}
              <textarea aria-label={m.message()} placeholder={m.placeholder()} class='w-full resize-y rounded-lg bg-base-100 px-2 py-1 text-sm outline-none' rows='3' maxlength='24000' bind:value={draft}
                        onkeydown={(event) => {
                          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
                            event.preventDefault()
                            void submit()
                          }
                        }}></textarea>
              <div class='flex flex-wrap items-center justify-between gap-2'>
                <div class='flex flex-wrap items-center gap-1'>
                  <button type='button' class='btn btn-ghost btn-square btn-sm' aria-label={m.attach()} title={m.attach()} onclick={() => attachmentInput?.click()}><span class='icon-[tabler--paperclip] agent-icon'></span></button>
                  {#if home.speech.asr}
                    <button type='button' class='btn btn-ghost btn-square btn-sm' aria-label={recording
                      ? m.stop_record()
                      : m.microphone()} title={recording
                      ? m.stop_record()
                      : m.microphone()} onclick={voiceRecord}><span class={recording ? 'icon-[tabler--player-stop] agent-icon text-error' : 'icon-[tabler--microphone] agent-icon'}></span></button>
                    <button type='button' class='btn btn-ghost btn-square btn-sm' aria-label={m.audio_file()} title={m.audio_file()} onclick={() => audioInput?.click()}><span class='icon-[tabler--wave-sine] agent-icon'></span></button>
                  {/if}
                  <details class='dropdown dropdown-top'>
                    <summary class='btn btn-ghost btn-sm' onclick={showKnowledge}><span class='icon-[tabler--books] agent-icon'></span>{m.choose_knowledge()}{chosenKnowledge.length
                      ? ` · ${chosenKnowledge.length}`
                      : ''}</summary>
                    <div class='dropdown-content z-30 mb-2 max-h-52 w-56 overflow-auto rounded-lg border agent-divider bg-base-100 p-2 shadow'>
                      {#each knowledge as base (base.id)}
                        <label class='flex gap-2 p-1 text-sm'><input type='checkbox' class='checkbox checkbox-sm' bind:group={chosenKnowledge} value={base.id} />{base.title}</label>
                      {:else}<p class='agent-muted p-2 text-xs'>{m.empty_list()}</p>{/each}
                    </div>
                  </details>
                  {#if home.skills.length}
                    <details class='dropdown dropdown-top'>
                      <summary class='btn btn-ghost btn-sm'>{m.skills()}</summary>
                      <div class='dropdown-content z-30 mb-2 w-48 rounded-lg border agent-divider bg-base-100 p-2 shadow'>
                        {#each home.skills as skill (skill.id)}
                          <label class='flex gap-2 p-1 text-sm'><input type='checkbox' class='checkbox checkbox-sm' bind:group={chosenSkills} value={skill.id} />{skill.title}</label>
                        {/each}
                      </div>
                    </details>
                  {/if}
                  <button type='button' class='btn btn-ghost btn-square btn-sm' aria-label={m.use_memory()} aria-pressed={useMemory} title={m.use_memory()} onclick={() => { useMemory = !useMemory }}>
                    <span class={`icon-[tabler--brain] agent-icon ${useMemory ? 'text-primary' : ''}`}></span>
                  </button>
                </div>
                <div class='flex items-center gap-1'>
                  <button type='button' class='btn btn-ghost btn-sm max-w-48' onclick={() => { pane = 'settings' }}><span class='truncate'>{home.agents.find(agent => agent.id === task?.settings.agentId)?.name ?? m.backend()}</span> · {modes[task.settings.mode]?.()}</button>
                  {#if running && lastTurn?.receipt}
                    <button type='button' class='btn btn-sm' onclick={() => lastTurn && change({ type: 'cancel', id: lastTurn.id })}><span class='icon-[tabler--player-stop] agent-icon'></span>{m.stop()}</button>
                  {:else}
                    <button class='btn btn-primary btn-sm' type='submit' disabled={pending || !draft.trim() || !task.settings.agentId}><span class='icon-[tabler--arrow-up] agent-icon'></span>{pending
                      ? m.submitting()
                      : m.send()}</button>
                  {/if}
                </div>
              </div>
              {#if !home.agents.length}<p class='agent-muted mt-2 px-2 text-xs'>{m.backend_offline()}</p>{/if}
              <input type='file' class='hidden' bind:this={attachmentInput} onchange={attach} />
              <input type='file' class='hidden' accept='audio/wav,audio/mpeg' bind:this={audioInput} onchange={voiceInput} />
            </form>
          {/if}
          {#if rename && task}
            <form class='mx-auto flex w-full max-w-3xl gap-2 pt-2' onsubmit={(event) => {
              event.preventDefault()
              if (task)
                void change({ type: 'rename', id: task.id, title: renameTitle })
              rename = false
            }}>
              <input class='input flex-1' aria-label={m.rename_task()} bind:value={renameTitle} required maxlength='120' />
              <button class='btn btn-primary'>{m.save()}</button>
              <button type='button' class='btn btn-ghost' onclick={() => { rename = false }}>{m.cancel()}</button>
            </form>
          {/if}
        </div>
      {/if}
    </WorkspaceLayout>

    <aside aria-label={m.show_results()} class="agent-rail w-full shrink-0 flex-col border-t xl:border-t-0 xl:border-l agent-divider {showResults ? 'flex' : 'hidden xl:flex'} {tab === 'changes' && preview
      ? 'xl:w-[520px]'
      : 'xl:w-[315px]'}">
      <div class='flex min-h-12 items-center gap-1 overflow-x-auto border-b agent-divider px-2' role='group' aria-label={m.show_results()}>
        {#each Object.entries(tabs) as [name, label] (name)}
          <button type='button' class:btn-active={name === tab} class='btn btn-ghost btn-xs' onclick={() => { tab = name as keyof typeof tabs }}>{label()}</button>
        {/each}
        <button class='btn btn-ghost btn-xs ml-auto xl:hidden' onclick={() => { showResults = false }} aria-label={m.close()}><span class='icon-[tabler--x] agent-icon'></span></button>
      </div>
      <div class='flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3'>
        {#if tab === 'activity'}
          {#if usage}<div class='agent-muted text-xs'>{m.native_usage()} {usage.used} / {usage.size}</div>{/if}
          {#each tools as tool (tool.id)}
            <details class='rounded-xl border agent-divider bg-base-100 px-3 py-2 text-sm'>
              <summary class='cursor-pointer'><span class='icon-[tabler--terminal] agent-icon align-middle opacity-70'></span> {tool.title ?? tool.kind ?? m.activity()} <span class='agent-muted text-xs'>{tool.status ?? ''}</span></summary>
              {#if tool.input}<pre class='mt-2 whitespace-pre-wrap break-all text-xs'>{tool.input}</pre>{/if}
              {#if tool.result}<pre class='mt-2 whitespace-pre-wrap break-all text-xs'>{tool.result}</pre>{/if}
            </details>
          {:else}<p class='agent-muted px-1 text-sm'>{m.empty_activity()}</p>{/each}
        {:else if tab === 'sources'}
          {#each sources as source (source.id)}
            <details class='rounded-xl border agent-divider bg-base-100 p-3 text-sm'>
              <summary class='cursor-pointer font-medium'>{source.title}</summary><p class='agent-muted mt-2 whitespace-pre-wrap break-words text-sm'>{source.excerpt}</p>
            </details>
          {:else}<p class='agent-muted px-1 text-sm'>{m.empty_sources()}</p>{/each}
        {:else if tab === 'artifacts'}
          {#each artifacts as item (item.id)}
            {#if item.id}<div class='rounded-xl border agent-divider bg-base-100 p-3'>
              <p class='break-all text-sm font-medium'>{item.name || item.id}</p>
              <a class='btn btn-ghost btn-xs mt-2' href={resolve(`/api/workspace?download=${encodeURIComponent(item.id)}`)}>{m.download()}</a>
              {#if item.name === 'workspace.patch'}<button class='btn btn-ghost btn-xs mt-2' onclick={() => inspect(item.id!)}>{m.preview()}</button>{/if}
            </div>{/if}
          {:else}<p class='agent-muted px-1 text-sm'>{m.empty_artifacts()}</p>{/each}
        {:else if patchSource && preview}
          <div class='text-sm font-medium'>{preview.title}</div>
          <ul class='agent-muted list-inside list-disc text-xs'>{#each preview.files as changed (changed)}<li class='break-all'>{changed}</li>{/each}</ul>
          {#key previewId}<CodeWorkspace source={patchSource} initialFile={{ kind: 'file', id: previewId, name: preview.title }} height='22rem' />{/key}
          <div class='flex flex-wrap gap-1'><button class='btn btn-primary btn-sm' onclick={() => { confirmPublish = true }}>{m.publish()}</button><a class='btn btn-sm' href={resolve(`/api/workspace?download=${encodeURIComponent(previewId)}`)}>{m.download()}</a></div>
          {#if publishResult}<div class='break-all text-xs text-success' role='status'>{publishResult}</div>{/if}
        {:else}
          <p class='agent-muted px-1 text-sm'>{m.empty_artifacts()}</p>
        {/if}
      </div>
    </aside>
    <Confirm bind:open={confirmPublish} title={m.publish()} message={m.confirm_publish()} confirmText={m.publish()} loading={publishing} onconfirm={publish} />
  </div>
{/if}
