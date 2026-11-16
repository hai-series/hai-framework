<!--
  @component ArtifactWorkspace
  复用文档、表格和图表组件的通用产物工作台；宿主提供读取、保存和授权。
  @example
  ```ts
  import { mount } from 'svelte'
  import { ArtifactWorkspace } from '@h-ai/ui'
  const component = mount(ArtifactWorkspace, { target: document.body, props: {
    artifacts: [{ id: 'report', title: '报告', kind: 'markdown', version: 1 }],
    onread: async id => ({ id, title: '报告', kind: 'markdown', version: 1, content: '# 简介' }),
  } })
  ```
-->
<script lang='ts'>
  import type { MarkdownRewriteRequest } from '../ai/document-types.js'
  import type { MarkdownEditSession } from './artifact-markdown.js'
  import type { ArtifactCreateRequest, ArtifactDocument, ArtifactSummary, ArtifactWorkspaceProps } from './workspace-types.js'
  import { onDestroy, untrack } from 'svelte'
  import { writeTextToClipboard } from '../../../internal/browser-safety.js'
  import { uiM } from '../../../messages.js'
  import { notifyError, notifyInfo, notifyWarning } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import Confirm from '../../compounds/Confirm.svelte'
  import Button from '../../primitives/Button.svelte'
  import AiDocumentEditor from '../ai/AiDocumentEditor.svelte'
  import AiTableEditor from '../ai/table/AiTableEditor.svelte'
  import Chart from '../charts/Chart.svelte'
  import { artifactMediaUrl, newArtifactContent, readArtifactChart, readArtifactTable } from './artifact-data.js'
  import { captureMarkdownEdit, readMarkdownSelection } from './artifact-markdown.js'
  import { prepareHtmlPreview } from './artifact-preview.js'

  const { artifacts, selectedId, onread, oncreate, onsave, onhistory, onrewrite, onselect, onerror, onleaveguard, class: className, ...rest }: ArtifactWorkspaceProps = $props()
  const dataAttributes = $derived(getDataAttributes(rest))
  let loaded = $state<ArtifactDocument>()
  let activeId = $state('')
  let draft = $state('')
  let renderedContent = $state('')
  let mode = $state<'preview' | 'source'>('preview')
  let busy = $state(false)
  let saving = $state(false)
  let rewriting = $state(false)
  let readFailed = $state(false)
  let createOpen = $state(false)
  let creating = $state(false)
  let newTitle = $state('')
  let newKind = $state<ArtifactCreateRequest['kind']>('markdown')
  let structureChanged = $state(false)
  let historical = $state(false)
  let history = $state<readonly ArtifactSummary[]>([])
  let historyOpen = $state(false)
  let conflict = $state<number>()
  let proposal = $state<{ content: string, baseDraft: string }>()
  let rewriteInstruction = $state('')
  let sourceSelection = $state('')
  let previewHost = $state<HTMLElement | null>(null)
  let tableEditor = $state<ReturnType<typeof AiTableEditor>>()
  let visualEditable = $state(false)
  let confirmDiscard = $state(false)
  let nextSelection: { id: string, version?: number } | undefined
  let leaveDecision: Promise<boolean> | undefined
  let leaveResolve: ((allowed: boolean) => void) | undefined
  let request: AbortController | undefined
  let action: AbortController | undefined
  let editing: MarkdownEditSession | undefined
  let epoch = $state(0)
  const dirty = $derived(!!loaded && draft !== (loaded.content ?? ''))
  const canEdit = $derived(!!loaded?.editable && !!onsave && !historical && !creating && ['markdown', 'html', 'table', 'chart'].includes(loaded.kind))
  const table = $derived(loaded?.kind === 'table'
    ? readArtifactTable(draft)
    : undefined)
  const chart = $derived(loaded?.kind === 'chart'
    ? readArtifactChart(draft)
    : undefined)
  const html = $derived(loaded?.kind === 'html' && mode === 'preview'
    ? prepareHtmlPreview(draft)
    : '')
  const mediaUrl = $derived(artifactMediaUrl(loaded?.mediaUrl))
  const downloadUrl = $derived(artifactMediaUrl(loaded?.downloadUrl))
  const rewriteActions = $derived([
    {
      id: 'improve',
      label: uiM('artifact_rewrite_improve'),
    },
    {
      id: 'shorten',
      label: uiM('artifact_rewrite_shorten'),
    },
  ])

  function failed(error: unknown) {
    notifyError(error, uiM('artifact_failed'))
    onerror?.(error)
  }

  function accept(document: ArtifactDocument) {
    loaded = document
    draft = document.content ?? ''
    renderedContent = draft
    conflict = undefined
    proposal = undefined
    history = []
    historyOpen = false
    structureChanged = false
    sourceSelection = ''
    epoch++
  }

  async function load(id: string, version?: number) {
    request?.abort()
    action?.abort()
    const current = new AbortController()
    request = current
    activeId = id
    history = []
    historyOpen = false
    busy = true
    saving = false
    rewriting = false
    readFailed = false
    try {
      const document = await onread(id, version, current.signal)
      if (current.signal.aborted)
        return
      accept(document)
      historical = version !== undefined
      mode = 'preview'
      onselect?.(id)
      return current.signal
    }
    catch (error) {
      if (!current.signal.aborted) {
        readFailed = true
        failed(error)
      }
    }
    finally {
      if (!current.signal.aborted)
        busy = false
    }
    return undefined
  }

  function select(id: string, version?: number) {
    tableEditor?.flushPendingTableChange()
    if (dirty || structureChanged) {
      nextSelection = { id, version }
      confirmDiscard = true
    }
    else {
      void load(id, version)
    }
  }

  function confirmLeave(): Promise<boolean> {
    tableEditor?.flushPendingTableChange()
    if (!dirty && !structureChanged && !saving && !rewriting && !creating)
      return Promise.resolve(true)
    if (leaveDecision)
      return leaveDecision
    nextSelection = undefined
    confirmDiscard = true
    leaveDecision = new Promise((resolve) => {
      leaveResolve = resolve
    })
    return leaveDecision
  }

  function resolveDiscard(allowed: boolean) {
    const next = nextSelection
    nextSelection = undefined
    if (leaveResolve && allowed) {
      // 用户已确认丢弃，随后原生提交或导航不应重复弹出硬离开提示。
      if (loaded) {
        draft = loaded.content ?? ''
        renderedContent = draft
        structureChanged = false
        epoch++
      }
      action?.abort()
      saving = false
      rewriting = false
      creating = false
    }
    leaveResolve?.(allowed)
    leaveResolve = undefined
    leaveDecision = undefined
    if (allowed && next)
      void load(next.id, next.version)
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    tableEditor?.flushPendingTableChange()
    if (dirty || structureChanged || saving || rewriting || creating) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  $effect(() => {
    const register = onleaveguard
    register?.(confirmLeave)
    return () => register?.(undefined)
  })

  $effect(() => {
    const id = selectedId ?? artifacts[0]?.id
    if (id && id !== untrack(() => activeId) && !untrack(() => creating))
      untrack(() => select(id))
  })

  $effect(() => {
    const host = previewHost
    const source = renderedContent
    if (host && loaded?.kind === 'markdown' && mode === 'preview') {
      editing = untrack(() => captureMarkdownEdit(source, host))
      visualEditable = editing.enabled
    }
  })

  function readVisual() {
    if (!editing)
      return
    const result = editing.read()
    structureChanged = !result.success
    if (result.success)
      draft = result.content
    else notifyWarning(uiM('artifact_structure_changed'))
  }

  function changeMode(next: 'preview' | 'source') {
    tableEditor?.flushPendingTableChange()
    if (structureChanged) {
      notifyWarning(uiM('artifact_structure_changed'))
      return
    }
    renderedContent = draft
    sourceSelection = ''
    mode = next
    epoch++
  }

  async function save() {
    tableEditor?.flushPendingTableChange()
    if (!loaded || !onsave || !canEdit || structureChanged || saving || rewriting)
      return
    action?.abort()
    const current = new AbortController()
    action = current
    saving = true
    try {
      const result = await onsave({ id: loaded.id, baseVersion: loaded.version, content: draft }, current.signal)
      if (current.signal.aborted)
        return
      if (result.status === 'conflict') {
        conflict = result.currentVersion
        notifyWarning(uiM('artifact_conflict'))
      }
      else {
        accept(result.document)
        notifyInfo(uiM('artifact_saved'))
      }
    }
    catch (error) {
      if (!current.signal.aborted)
        failed(error)
    }
    finally {
      if (!current.signal.aborted)
        saving = false
    }
  }

  async function showHistory() {
    if (!loaded || !onhistory || saving || rewriting)
      return
    action?.abort()
    const current = new AbortController()
    action = current
    try {
      const result = await onhistory(loaded.id, current.signal)
      if (!current.signal.aborted) {
        history = result
        historyOpen = true
      }
    }
    catch (error) {
      if (!current.signal.aborted)
        failed(error)
    }
  }

  async function rewrite(selection: MarkdownRewriteRequest) {
    if (!loaded || !onrewrite || rewriting || saving || structureChanged)
      return
    const selected = mode === 'source'
      ? { success: true as const, selectedText: selection.selectedText }
      : previewHost && selection.selectionSnapshot
      ? readMarkdownSelection(draft, previewHost, selection.selectionSnapshot)
      : { success: false as const }
    if (!selected.success || !selected.selectedText || !draft.includes(selected.selectedText)) {
      notifyWarning(uiM('artifact_rewrite_source_hint'))
      return
    }
    action?.abort()
    const current = new AbortController()
    action = current
    rewriting = true
    const baseDraft = draft
    try {
      const result = await onrewrite({
        id: loaded.id,
        baseVersion: loaded.version,
        content: draft,
        selectedText: selected.selectedText,
        instruction: rewriteInstruction.trim() || rewriteActions.find(item => item.id === selection.actionId)?.label || selection.actionId,
      }, current.signal)
      if (!current.signal.aborted)
        proposal = { content: result.content, baseDraft }
    }
    catch (error) {
      if (!current.signal.aborted)
        failed(error)
    }
    finally {
      if (!current.signal.aborted)
        rewriting = false
    }
  }

  function selectSource(event: Event & { currentTarget: HTMLTextAreaElement }) {
    const input = event.currentTarget
    if (input.value !== draft.replace(/\r\n?/g, '\n')) {
      sourceSelection = ''
      return
    }
    // textarea 按 LF 计算选区，转换回原始 CRLF 偏移，提交片段必须逐字来自源码。
    const offsets = [0]
    for (let index = 0; index < draft.length; index++) {
      if (draft[index] === '\r' && draft[index + 1] === '\n')
        index++
      offsets.push(index + 1)
    }
    sourceSelection = draft.slice(offsets[input.selectionStart], offsets[input.selectionEnd])
  }

  async function useHistorical() {
    if (!loaded)
      return
    const source = draft
    const id = loaded.id
    const accepted = await load(id)
    if (accepted && !accepted.aborted) {
      draft = source
      renderedContent = source
      epoch++
    }
  }

  async function copyDraft(visible = false) {
    const text = visible
      ? previewHost?.innerText ?? previewHost?.textContent ?? draft
      : draft
    if (await writeTextToClipboard(text))
      notifyInfo(uiM('artifact_copy_success'))
    else notifyWarning(uiM('artifact_copy_failed'))
  }

  async function create(event: SubmitEvent) {
    event.preventDefault()
    if (!oncreate || creating)
      return
    tableEditor?.flushPendingTableChange()
    if (dirty || structureChanged) {
      notifyWarning(uiM('artifact_save_first'))
      return
    }
    action?.abort()
    const current = new AbortController()
    action = current
    creating = true
    try {
      const document = await oncreate({
        title: newTitle.trim(),
        kind: newKind,
        content: newArtifactContent(newKind, newTitle.trim(), uiM('artifact_template_body'), uiM('artifact_template_name'), uiM('artifact_template_value'), uiM('artifact_template_click')),
      }, current.signal)
      if (!current.signal.aborted) {
        accept(document)
        activeId = document.id
        historical = false
        mode = 'preview'
        createOpen = false
        onselect?.(document.id)
      }
    }
    catch (error) {
      if (!current.signal.aborted)
        failed(error)
    }
    finally {
      if (!current.signal.aborted)
        creating = false
    }
  }

  onDestroy(() => {
    request?.abort()
    action?.abort()
    leaveResolve?.(false)
  })
</script>

<svelte:window onbeforeunload={beforeUnload} />

<section {...dataAttributes} class={cn('hai-artifact-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-3', className)} aria-label={uiM('artifact_workspace')}>
  <div class='flex flex-wrap items-end gap-3'>
    <label class='grid w-full min-w-0 gap-1 text-sm sm:min-w-56 sm:flex-1'>
      {uiM('artifact_choose')}
      <select class='select w-full min-w-0' value={activeId} disabled={saving || creating} onchange={(event) => {
        const next = event.currentTarget.value
        event.currentTarget.value = activeId
        select(next)
      }}>
        {#if !artifacts.length}<option value=''>{uiM('artifact_empty')}</option>{/if}
        {#each artifacts as item (item.id)}<option value={item.id}>{item.title}</option>{/each}
      </select>
    </label>
    {#if oncreate}<Button size='sm' disabled={busy || saving || creating} onclick={() => { createOpen = !createOpen }}>{uiM('artifact_new')}</Button>{/if}
    {#if loaded && !busy && !readFailed}
      <span class='text-sm text-base-content/60'>{uiM('artifact_version', { version: loaded.version })}{dirty
        ? ` · ${uiM('artifact_unsaved')}`
        : ''}</span>
      {#if downloadUrl}<a class='btn btn-ghost btn-sm' href={downloadUrl} download>{uiM('artifact_download')}</a>{/if}
      {#if onhistory}<Button size='sm' variant='ghost' onclick={showHistory} disabled={saving}>{uiM('artifact_history')}</Button>{/if}
      {#if canEdit}<Button size='sm' variant='primary' onclick={save} disabled={!dirty || saving || rewriting || structureChanged} loading={saving}>{uiM('artifact_save')}</Button>{/if}
    {/if}
  </div>
  {#if createOpen && oncreate}
    <form class='flex flex-wrap items-end gap-3 rounded-lg border border-base-300 p-3' onsubmit={create}>
      <label class='grid w-full min-w-0 gap-1 text-sm sm:min-w-56 sm:flex-1'>{uiM('artifact_title')}<input class='input w-full' required maxlength={160} bind:value={newTitle} disabled={creating} /></label>
      <label class='grid gap-1 text-sm'>{uiM('artifact_kind')}
        <select class='select' bind:value={newKind} disabled={creating}>
          <option value='markdown'>Markdown</option><option value='html'>HTML</option>
          <option value='table'>{uiM('artifact_kind_table')}</option><option value='chart'>{uiM('artifact_kind_chart')}</option>
        </select>
      </label>
      <Button type='submit' variant='primary' loading={creating} disabled={creating} submitHint>{uiM('artifact_create')}</Button>
    </form>
  {/if}
  {#if busy}
    <div class='grid min-h-48 place-items-center text-base-content/60' role='status'>{uiM('common_loading')}</div>
  {:else if readFailed}
    <Button onclick={() => load(activeId)}>{uiM('artifact_retry')}</Button>
  {:else if loaded}
    {#if structureChanged}
      <div class='flex flex-wrap items-center gap-2 rounded-lg border border-base-300 p-3 text-sm' role='status'>
        <span class='flex-1'>{uiM('artifact_edit_recovery')}</span>
        <Button size='sm' variant='ghost' onclick={() => copyDraft(true)}>{uiM('artifact_copy_visible')}</Button>
        <Button size='sm' onclick={() => select(activeId)}>{uiM('artifact_reload')}</Button>
      </div>
    {/if}
    {#if conflict !== undefined}
      <div class='flex flex-wrap items-center gap-2 rounded-lg border border-base-300 p-3 text-sm' role='status'>
        <span class='flex-1'>{uiM('artifact_conflict_detail', { version: conflict })}</span>
        <Button size='sm' variant='ghost' onclick={() => copyDraft()}>{uiM('artifact_copy_draft')}</Button>
        <Button size='sm' onclick={() => select(activeId)}>{uiM('artifact_reload')}</Button>
      </div>
    {/if}
    {#if historyOpen}
      <div class='flex flex-wrap items-center gap-2 rounded-lg border border-base-300 p-3' aria-label={uiM('artifact_history')}>
        {#each history as item (`${item.id}:${item.version}`)}<Button size='sm' variant='ghost' onclick={() => select(item.id, item.version)}>{uiM('artifact_version', { version: item.version })}</Button>{/each}
        <Button size='sm' variant='ghost' onclick={() => { historyOpen = false }}>{uiM('common_close')}</Button>
      </div>
    {/if}
    {#if historical}
      <div class='flex flex-wrap items-center gap-2 text-sm' role='status'><span>{uiM('artifact_historical')}</span>
        <Button size='sm' onclick={() => select(activeId)}>{uiM('artifact_latest')}</Button>
        {#if onsave}<Button size='sm' variant='ghost' onclick={useHistorical}>{uiM('artifact_restore_draft')}</Button>{/if}
      </div>
    {/if}
    {#if loaded.content !== undefined}
      <div class='flex flex-wrap items-center gap-2'>
        <button type='button' class={mode === 'preview'
          ? 'btn btn-sm btn-primary'
          : 'btn btn-sm btn-ghost'} onclick={() => changeMode('preview')} aria-pressed={mode === 'preview'}>{uiM('artifact_preview')}</button>
        <button type='button' class={mode === 'source'
          ? 'btn btn-sm btn-primary'
          : 'btn btn-sm btn-ghost'} onclick={() => changeMode('source')} aria-pressed={mode === 'source'}>{uiM('artifact_source')}</button>
        {#if onrewrite && canEdit && loaded.kind === 'markdown'}
          <input class='input input-sm w-full min-w-0 flex-none sm:w-auto sm:flex-1' aria-label={uiM('artifact_rewrite_instruction')} placeholder={uiM('artifact_rewrite_instruction')} bind:value={rewriteInstruction} />
          {#if mode === 'source'}
            <Button size='sm' disabled={!sourceSelection.trim() || saving || rewriting}
                    onclick={() => rewrite({ actionId: 'improve', content: draft, selectedText: sourceSelection })}>{uiM('artifact_rewrite_selection')}</Button>
          {/if}
        {/if}
      </div>
    {/if}
    {#if proposal !== undefined}
      <section class='flex min-h-72 flex-col gap-2 rounded-lg border border-base-300 p-3' aria-label={uiM('artifact_proposal')}>
        <div class='flex flex-wrap items-center gap-2'><span class='flex-1 text-sm font-medium'>{uiM(proposal.baseDraft === draft
          ? 'artifact_proposal'
          : 'artifact_proposal_stale')}</span>
          <Button size='sm' variant='primary' disabled={proposal.baseDraft !== draft} onclick={() => {
            if (!proposal || proposal.baseDraft !== draft)
              return
            draft = proposal.content
            sourceSelection = ''
            renderedContent = draft
            proposal = undefined
            epoch++
          }}>{uiM('artifact_apply')}</Button>
          <Button size='sm' variant='ghost' onclick={() => { proposal = undefined }}>{uiM('artifact_discard')}</Button>
        </div>
        <AiDocumentEditor content={proposal.content} showOutline={false} showToolbar={false} class='min-h-56' />
      </section>
    {/if}
    {#if mode === 'source' && loaded.content !== undefined}
      <label class='flex min-h-80 min-w-0 flex-1 flex-col gap-1 text-sm'>
        <span class='sr-only'>{uiM('artifact_source')}</span>
        <textarea class='textarea min-h-80 w-full flex-1 font-mono text-sm' readonly={!canEdit || saving || rewriting} bind:value={draft}
                  onselect={selectSource} oninput={() => { sourceSelection = '' }} spellcheck='false'></textarea>
      </label>
    {:else if loaded.kind === 'markdown'}
      <p class='text-xs text-base-content/60'>{uiM('artifact_markdown_hint')}</p>
      {#key epoch}
        <AiDocumentEditor content={renderedContent} title={loaded.title} sourceKind='document' showOutline initialOutlineCollapsed showToolbar
                          editable={canEdit && visualEditable && !saving && !rewriting} bind:previewHost onpreviewinput={readVisual}
                          onrewrite={onrewrite && canEdit
                            ? rewrite
                            : undefined} {rewriteActions} rewritePending={rewriting}
                          onhistory={onhistory ? showHistory : undefined} class='min-h-80 flex-1' />
      {/key}
    {:else if loaded.kind === 'table' && table}
      <div class='flex min-h-80 min-w-0 flex-1 flex-col' oninput={() => tableEditor?.flushPendingTableChange()}>
        <AiTableEditor title={loaded.title} tableData={table} editable={canEdit && !saving} bind:this={tableEditor}
                       ontablechange={(change) => { draft = JSON.stringify(change.nextData, null, 2) }} class='min-h-80 flex-1' />
      </div>
    {:else if loaded.kind === 'chart' && chart}
      <Chart {...chart} title={loaded.title} />
    {:else if loaded.kind === 'html'}
      <p class='text-xs text-base-content/60'>{uiM('artifact_html_hint')}</p>
      <iframe class='min-h-96 w-full flex-1 rounded-lg border border-base-300 bg-white' title={loaded.title}
              srcdoc={html} sandbox='allow-scripts' referrerpolicy='no-referrer'
              allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"></iframe>
    {:else if loaded.kind === 'image' && mediaUrl}
      <img src={mediaUrl} alt={loaded.title} class='max-h-[70vh] max-w-full self-center rounded-lg object-contain' />
    {:else if loaded.kind === 'audio' && mediaUrl}
      <audio controls preload='metadata' src={mediaUrl} class='w-full'><track kind='captions' /></audio>
    {:else if loaded.kind === 'video' && mediaUrl}
      <video controls preload='metadata' src={mediaUrl} class='max-h-[70vh] w-full rounded-lg'><track kind='captions' /></video>
    {:else}
      <div class='rounded-lg border border-dashed border-base-300 p-6 text-sm text-base-content/60'>{uiM('artifact_download_only')}</div>
    {/if}
  {:else}
    <div class='grid min-h-48 place-items-center text-sm text-base-content/60'>{uiM('artifact_empty')}</div>
  {/if}
  {#if confirmDiscard}
    <Confirm bind:open={confirmDiscard} title={uiM('artifact_unsaved')} message={uiM('artifact_discard_confirm')}
             confirmText={uiM('artifact_discard')} onconfirm={() => resolveDiscard(true)} oncancel={() => resolveDiscard(false)} />
  {/if}
</section>
