<script lang='ts'>
  import type { HomeView, KnowledgeView, MemoryView } from '#lib/client.js'
  import type { AgentPreferences, AgentResource, WorkspaceAction } from '#lib/workspace.js'
  import { resolve } from '$app/paths'
  import { untrack } from 'svelte'
  import { read, send, upload } from '#lib/client.js'
  import * as m from '#lib/paraglide/messages.js'

  interface Props {
    pane: 'personal' | 'memory' | 'knowledge' | 'files' | 'permissions'
    home: HomeView
    onpreferences: (preferences: AgentPreferences) => void
    onerror: (error: unknown) => void
  }
  const { pane, home, onpreferences, onerror }: Props = $props()
  let prefs = $state<AgentPreferences>()
  let memories = $state<MemoryView>({ entries: [], proposals: [] })
  let knowledge = $state<KnowledgeView[]>([])
  let files = $state<AgentResource[]>([])
  let rules = $state<{ id: string, summary?: string, expires?: number }[]>([])
  let selection = $state('')
  const chosenBase = $derived(knowledge.find(item => item.id === selection))
  let title = $state('')
  let content = $state('')
  let docTitle = $state('')
  let docId = $state('')
  let chosenFile = $state('')
  let search = $state('')
  let editing = $state('')
  let pending = $state(false)
  let saved = $state(false)
  let uploadInput: HTMLInputElement
  const labels = {
    personal: m.personal,
    memory: m.memory,
    knowledge: m.knowledge,
    files: m.files,
    permissions: m.permissions,
  }

  async function load(target: Props['pane'], query = '') {
    try {
      if (target === 'memory') {
        memories = await read<MemoryView>({ pane: target, query })
      }
      else if (target === 'knowledge') {
        knowledge = await read<KnowledgeView[]>({ pane: target })
        files = await read<AgentResource[]>({ pane: 'files' })
      }
      else if (target === 'files') {
        files = await read<AgentResource[]>({ pane: target })
      }
      else if (target === 'permissions') {
        rules = await read({ pane: target })
      }
    }
    catch (error) { onerror(error) }
  }

  $effect(() => {
    const target = pane
    prefs = untrack(() => ({ ...home.preferences }))
    saved = false
    void load(target)
  })

  async function run(command: WorkspaceAction, onDone?: () => void) {
    pending = true
    saved = false
    try {
      await send(command)
      onDone?.()
      await load(pane)
      saved = true
    }
    catch (error) { onerror(error) }
    finally { pending = false }
  }

  function addMemory(event: SubmitEvent) {
    event.preventDefault()
    const command: WorkspaceAction = editing
      ? { type: 'memory-edit', id: editing, text: content }
      : { type: 'memory-add', text: content }
    void run(command, () => {
      content = ''
      editing = ''
    })
  }

  function addDocument(event: SubmitEvent) {
    event.preventDefault()
    if (!chosenBase)
      return
    docId ||= crypto.randomUUID()
    void run({
      type: 'knowledge-index',
      id: chosenBase.id,
      document: docId,
      title: docTitle,
      text: chosenFile ? undefined : content,
      file: chosenFile || undefined,
    }, () => {
      content = ''
      docTitle = ''
      docId = ''
      chosenFile = ''
    })
  }

  async function uploadFile(event: Event) {
    if (!(event.currentTarget instanceof HTMLInputElement))
      return
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file)
      return
    try {
      const saved = await upload(file)
      await load(pane)
      chosenFile = saved.id
    }
    catch (error) { onerror(error) }
  }
</script>

<section class='mx-auto w-full max-w-4xl px-4 py-6 sm:px-8'>
  <h2 class='mb-5 text-2xl font-semibold tracking-tight'>{labels[pane]()}</h2>
  {#if pane === 'personal' && prefs}
    <form class='grid max-w-xl gap-4' onsubmit={(event) => {
      event.preventDefault()
      if (prefs) {
        const settings = { ...prefs }
        void run({ type: 'personal', preferences: settings }, () => onpreferences(settings))
      }
    }}>
      <label class='grid gap-1.5 text-sm font-medium'>
        {m.definition()}
        <textarea class='textarea w-full' rows='4' bind:value={prefs.preference} maxlength='3000'></textarea>
      </label>
      <div class='grid gap-3 sm:grid-cols-2'>
        <label class='grid gap-1 text-sm font-medium'>{m.backend()}
          <select class='select w-full' bind:value={prefs.agentId}>
            <option value="">{m.model_default()}</option>
            {#each home.agents as agent (agent.id)}<option value={agent.id}>{agent.name}</option>{/each}
          </select>
        </label>
        <label class='grid gap-1 text-sm font-medium'>{m.mode()}
          <select class='select w-full' bind:value={prefs.mode}>
            <option value='auto'>{m.mode_auto()}</option><option value='shared'>{m.mode_shared()}</option>
            <option value='user'>{m.mode_user()}</option><option value='task'>{m.mode_task()}</option>
          </select>
        </label>
      </div>
      <label class='grid gap-1.5 text-sm font-medium'>
        {m.voice()}
        <input class='input w-full' bind:value={prefs.voice} maxlength='100' />
      </label>
      <label class='flex items-center gap-2 text-sm'><input class='checkbox checkbox-sm' type='checkbox' bind:checked={prefs.memoryRead} />{m.use_memory()}</label>
      <label class='grid gap-1 text-sm font-medium'>{m.memory_write()}
        <select class='select w-full' bind:value={prefs.memoryWrite}>
          <option value='confirm'>{m.memory_confirm()}</option>
          <option value='on-success'>{m.memory_auto()}</option>
          <option value='none'>{m.memory_none()}</option>
        </select>
      </label>
      <div class='flex items-center gap-3'>
        <button class='btn btn-primary' disabled={pending}>{m.save_settings()}</button>
        {#if saved}<span class='text-sm text-success' role='status'>{m.saved()}</span>{/if}
      </div>
    </form>
  {:else if pane === 'memory'}
    <form class='mb-6 grid gap-2' onsubmit={addMemory}>
      <label class='text-sm font-medium' for='memory-input'>{m.new_memory()}</label>
      <div class='flex flex-wrap gap-2'>
        <input id='memory-input' class='input flex-1' required maxlength='4000' bind:value={content} />
        <button class='btn btn-primary' disabled={pending}>{editing
          ? m.save()
          : m.add_memory()}</button>
      </div>
    </form>
    {#if memories.proposals.length}
      <h3 class='mb-2 font-semibold'>{m.suggested_memory()}</h3>
      {#each memories.proposals as draft (draft.id)}
        <article class='mb-2 rounded-lg border agent-divider p-3'>
          <p class='mb-2 text-sm'>{draft.title}</p>
          <button class='btn btn-sm' onclick={() => run({ type: 'memory-confirm', id: draft.id, save: true })}>{m.keep()}</button>
          <button class='btn btn-ghost btn-sm' onclick={() => run({ type: 'memory-confirm', id: draft.id, save: false })}>{m.delete()}</button>
        </article>
      {/each}
    {/if}
    <form class='mb-3 flex flex-wrap gap-2' onsubmit={(event) => {
      event.preventDefault()
      void load('memory', search)
    }}>
      <input class='input flex-1' aria-label={m.search_memory()} placeholder={m.search_memory()} bind:value={search} />
      <button class='btn'>{m.search_memory()}</button>
    </form>
    {#each memories.entries as entry (entry.id)}
      <div class='flex items-start justify-between gap-2 border-b agent-divider py-3 text-sm'>
        <p class='break-words'>{entry.content}</p>
        <div class='flex shrink-0'>
          <button class='btn btn-ghost btn-xs' onclick={() => {
            editing = entry.id
            content = entry.content
          }}>{m.edit()}</button>
          <button class='btn btn-ghost btn-xs' onclick={() => run({ type: 'memory-remove', id: entry.id })}>{m.delete()}</button>
        </div>
      </div>
    {:else}<p class='agent-muted text-sm'>{m.empty_list()}</p>{/each}
  {:else if pane === 'knowledge'}
    <form class='mb-4 flex flex-wrap items-end gap-2' onsubmit={(event) => {
      event.preventDefault()
      const id = crypto.randomUUID()
      void run({ type: 'knowledge-add', id, title }, () => {
        selection = id
        title = ''
      })
    }}>
      <label class='grid flex-1 gap-1 text-sm font-medium'>{m.new_knowledge()}<input required class='input w-full' bind:value={title} maxlength='120' /></label>
      <button class='btn btn-primary' disabled={pending}>{m.add_knowledge()}</button>
    </form>
    <div class='mb-5 flex flex-wrap gap-2'>
      {#each knowledge as item (item.id)}
        <button class:btn-active={item.id === selection} class='btn btn-sm' onclick={() => {
          selection = item.id
          docId = ''
        }}>{item.title}</button>
      {:else}<p class='agent-muted text-sm'>{m.empty_list()}</p>{/each}
    </div>
    {#if chosenBase}
      <form class='mb-6 grid gap-2 rounded-xl border agent-divider p-4' onsubmit={addDocument}>
        <label class='grid gap-1 text-sm font-medium'>{m.doc_title()}<input required class='input w-full' bind:value={docTitle} maxlength='160' /></label>
        <label class='grid gap-1 text-sm font-medium'>{m.select_file()}
          <select class='select w-full' bind:value={chosenFile}>
            <option value="">{m.paste_text()}</option>
            {#each files as file (file.id)}<option value={file.id}>{file.title}</option>{/each}
          </select>
        </label>
        {#if !chosenFile}<label class='grid gap-1 text-sm font-medium'>{m.doc_body()}<textarea required class='textarea w-full' rows='5' bind:value={content}></textarea></label>{/if}
        <div class='flex flex-wrap items-center gap-2'>
          <button class='btn btn-primary btn-sm' disabled={pending}>{pending
            ? m.loading()
            : docId
            ? m.retry_index()
            : m.index_doc()}</button>
          <button type='button' class='btn btn-sm' onclick={() => uploadInput.click()}>{m.attach()}</button>
          {#if saved}<span class='text-sm text-success' role='status'>{m.indexed()}</span>{/if}
        </div>
      </form>
      {#each chosenBase.documents as doc (doc.documentId)}
        <div class='mb-1 flex items-center justify-between rounded-lg border agent-divider p-2 text-sm'>
          <span>{doc.title || doc.documentId}</span>
          <button class='btn btn-ghost btn-xs' onclick={() => chosenBase && run({ type: 'knowledge-remove', id: chosenBase.id, document: doc.documentId })}>{m.delete()}</button>
        </div>
      {/each}
      <button class='btn btn-ghost btn-sm mt-3 text-error' onclick={() => chosenBase && run({ type: 'knowledge-delete', id: chosenBase.id }, () => { selection = '' })}>{m.delete()} {m.knowledge()}</button>
    {/if}
  {:else if pane === 'files'}
    <button class='btn btn-primary mb-4' onclick={() => uploadInput.click()}>{m.attach()}</button>
    {#each files as file (file.id)}
      <div class='flex items-center justify-between gap-2 border-b agent-divider py-2 text-sm'>
        <span class='break-all'>{file.title}</span><a class='btn btn-ghost btn-xs' href={resolve(`/api/workspace?download=${encodeURIComponent(file.id)}`)}>{m.download()}</a>
      </div>
    {:else}<p class='agent-muted text-sm'>{m.empty_list()}</p>{/each}
  {:else if pane === 'permissions'}
    {#each rules as rule (rule.id)}
      <div class='flex flex-wrap items-center justify-between gap-2 border-b agent-divider py-2 text-sm'>
        <span class='break-all'>{rule.summary ?? rule.id}</span>
        <button class='btn btn-sm' onclick={() => run({ type: 'revoke', id: rule.id })}>{m.revoke()}</button>
      </div>
    {:else}<p class='agent-muted text-sm'>{m.empty_list()}</p>{/each}
  {/if}
  <input type='file' class='hidden' bind:this={uploadInput} onchange={uploadFile} />
</section>
