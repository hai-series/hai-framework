<script lang='ts'>
  import type { ArtifactDocument, ArtifactSaveRequest, ArtifactSummary, ToolCatalogItem, ToolResource, WorkspaceLeaveGuard } from '@h-ai/ui/components/scenes/tools/index'
  import type { ToolResourceCursors } from '#lib/services/workbench.js'
  import { ArtifactWorkspace, ToolWorkspace } from '@h-ai/ui/components/scenes/tools/index'
  import { onDestroy, untrack } from 'svelte'
  import { mergePageItems } from '#lib/client.js'
  import * as m from '#lib/paraglide/messages.js'
  import { workbench } from '#lib/services/workbench.js'

  interface Props {
    pane: 'artifacts' | 'tools'
    selectedId?: string
    onopen: (id: string) => void
    onerror: (error: unknown) => void
    onleaveguard?: (guard: WorkspaceLeaveGuard | undefined) => void
  }
  const { pane, selectedId, onopen, onerror, onleaveguard }: Props = $props()
  let artifacts = $state<ArtifactSummary[]>([])
  let nextArtifactCursor = $state<string>()
  let catalog = $state<ToolCatalogItem[]>([])
  let resources = $state<ToolResource[]>([])
  let nextResources = $state<ToolResourceCursors>()
  let loading = $state(false)
  let loadingMore = $state(false)
  let failed = $state(false)
  let request: AbortController | undefined

  async function load(target: Props['pane']) {
    request?.abort()
    const current = new AbortController()
    request = current
    loading = true
    loadingMore = false
    failed = false
    try {
      if (target === 'tools') {
        const [tools, files] = await Promise.all([
          workbench.tools.catalog(current.signal),
          workbench.tools.resources(undefined, current.signal),
        ])
        if (!current.signal.aborted) {
          catalog = tools
          resources = files.items
          nextResources = files.next
        }
      }
      else {
        const result = await workbench.artifacts.list(undefined, current.signal)
        if (!current.signal.aborted) {
          artifacts = result.items
          nextArtifactCursor = result.nextCursor
        }
      }
    }
    catch (error) {
      if (!current.signal.aborted) {
        failed = true
        onerror(error)
      }
    }
    finally {
      if (!current.signal.aborted)
        loading = false
    }
  }

  async function loadMore() {
    const signal = request?.signal
    if (!signal || signal.aborted || loadingMore)
      return
    loadingMore = true
    try {
      if (pane === 'artifacts' && nextArtifactCursor) {
        const page = await workbench.artifacts.list(nextArtifactCursor, signal)
        if (!signal.aborted) {
          artifacts = mergePageItems(artifacts, page.items)
          nextArtifactCursor = page.nextCursor
        }
      }
      else if (pane === 'tools' && nextResources) {
        const page = await workbench.tools.resources(nextResources, signal)
        if (!signal.aborted) {
          resources = mergePageItems(resources, page.items)
          nextResources = page.next
        }
      }
    }
    catch (error) {
      if (!signal.aborted)
        onerror(error)
    }
    finally {
      if (!signal.aborted)
        loadingMore = false
    }
  }

  function upsert(document: ArtifactDocument) {
    artifacts = [
      document,
      ...artifacts.filter(item => item.id !== document.id),
    ]
  }

  async function save(input: ArtifactSaveRequest, signal: AbortSignal) {
    const result = await workbench.artifacts.save(input, signal)
    if (result.status === 'saved')
      upsert(result.document)
    return result
  }

  $effect(() => {
    const target = pane
    untrack(() => {
      void load(target)
    })
  })
  onDestroy(() => request?.abort())
</script>

<div class='flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3 sm:p-4'>
  {#if !loading && !failed && (pane === 'artifacts'
    ? nextArtifactCursor
    : nextResources)}
    <button class='btn btn-ghost btn-sm self-start' disabled={loadingMore} onclick={loadMore}>{m.load_more()}</button>
  {/if}
  {#if loading}<div role='status' class='grid min-h-40 place-items-center text-sm opacity-60'>{m.loading()}</div>
  {:else if failed}<button class='btn btn-sm self-start' onclick={() => load(pane)}>{m.retry()}</button>
  {:else if pane === 'tools'}
    <ToolWorkspace tools={catalog} {resources} initialRun={workbench.tools.resume()} onrunchange={workbench.tools.remember}
                   onrun={workbench.tools.run} onstatus={workbench.tools.status} oncancel={workbench.tools.cancel} onartifact={artifact => onopen(artifact.id)} />
  {:else}
    <ArtifactWorkspace {artifacts} {selectedId} {onleaveguard} onread={workbench.artifacts.read} onsave={save}
                       onhistory={workbench.artifacts.history} onrewrite={workbench.artifacts.rewrite} onselect={onopen}
                       oncreate={async (input, signal) => {
                         const document = await workbench.artifacts.create(input, signal)
                         upsert(document)
                         return document
                       }} />
  {/if}
</div>
