<script lang='ts'>
  import type { ArtifactDocument, ArtifactSaveRequest, ArtifactSummary, ToolCatalogItem, ToolResource, WorkspaceLeaveGuard } from '@h-ai/ui/components/scenes/tools/index'
  import { ArtifactWorkspace, ToolWorkspace } from '@h-ai/ui/components/scenes/tools/index'
  import { onDestroy, untrack } from 'svelte'
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
  let catalog = $state<ToolCatalogItem[]>([])
  let resources = $state<ToolResource[]>([])
  let loading = $state(false)
  let failed = $state(false)
  let request: AbortController | undefined

  async function load(target: Props['pane']) {
    request?.abort()
    const current = new AbortController()
    request = current
    loading = true
    failed = false
    try {
      if (target === 'tools') {
        const [tools, files] = await Promise.all([
          workbench.tools.catalog(current.signal),
          workbench.tools.resources(current.signal),
        ])
        if (!current.signal.aborted) {
          catalog = tools
          resources = files
        }
      }
      else {
        const result = await workbench.artifacts.list(current.signal)
        if (!current.signal.aborted)
          artifacts = result
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
