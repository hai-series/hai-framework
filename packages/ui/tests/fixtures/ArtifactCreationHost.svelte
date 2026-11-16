<script lang='ts'>
  import type { ArtifactDocument, ArtifactSummary } from '../../src/lib/components/scenes/tools/workspace-types.js'
  import ArtifactWorkspace from '../../src/lib/components/scenes/tools/ArtifactWorkspace.svelte'

  let artifacts = $state<ArtifactSummary[]>([])
  let selectedId = $state('')
  let document: ArtifactDocument
</script>

<ArtifactWorkspace {artifacts} selectedId={selectedId || undefined} onselect={(id) => { selectedId = id }}
                   onread={async () => document} onsave={async () => ({ status: 'saved', document })}
                   oncreate={async (input) => {
                     document = {
                       ...input,
                       id: 'created',
                       version: 1,
                       editable: true,
                     }
                     artifacts = [document]
                     return document
                   }} />
