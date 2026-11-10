<script lang='ts'>
  import type { CodeWorkspaceRange } from '@h-ai/ui/components/scenes/code/index'
  import { Button } from '@h-ai/ui'
  import { CodeWorkspace } from '@h-ai/ui/components/scenes/code/index'
  import { createCodeWorkspaceDemoSource, reviewAncestors, reviewFindingRange, reviewRules } from '#lib/components/gallery/code-workspace-demo.js'
  import * as m from '#lib/paraglide/messages.js'

  const source = createCodeWorkspaceDemoSource()
  let showReviewTip = $state(false)
  let marked = $state<{ fileId: string, version: string | undefined, range: CodeWorkspaceRange }>()

  function formatLines(range: CodeWorkspaceRange) {
    const last = range.endColumn === 1 && range.endLine > range.startLine
      ? range.endLine - 1
      : range.endLine
    return last === range.startLine
      ? `L${range.startLine}`
      : `L${range.startLine}–L${last}`
  }
</script>

<div data-testid='code-workspace-demo'>
  <CodeWorkspace
    {source}
    initialFile={reviewRules}
    initialAncestors={reviewAncestors}
    height='38rem'
  >
    {#snippet inspector({ file, selection, reveal })}
      <div class='grid gap-3 p-3 text-sm'>
        <div>
          <h4 class='font-semibold'>{m.gallery_code_workspace_analysis_file()}</h4>
          <p class='mt-1 break-words font-mono text-xs opacity-75'>{file.node.id}</p>
        </div>

        {#if file.node.id === reviewRules.id}
          <div class='grid gap-1.5 border-y border-base-300 py-3'>
            <span class='badge badge-error badge-outline badge-sm'>{m.gallery_code_workspace_risk_label()}</span>
            <p>{m.gallery_code_workspace_diagnostic()}</p>
            <Button variant='ghost' size='xs' class='justify-self-start' onclick={() => reveal(reviewFindingRange)}>
              {m.gallery_code_workspace_diagnostic_hint({ line: reviewFindingRange.startLine })}
            </Button>
          </div>
        {:else}
          <p>{m.gallery_code_workspace_analysis_empty()}</p>
        {/if}

        <div class='grid gap-1.5'>
          <h4 class='font-semibold'>{m.gallery_code_workspace_analysis_selection()}</h4>
          {#if selection}
            <p>{m.gallery_code_workspace_analysis_preview({
              range: formatLines(selection.range),
            })}</p>
            <pre class='max-h-28 overflow-auto rounded bg-base-200 p-2 text-xs whitespace-pre-wrap wrap-anywhere'><code>{selection.text}</code></pre>
          {:else}
            <p class='opacity-75'>{m.gallery_code_workspace_analysis_select()}</p>
          {/if}
        </div>

        {#if marked && marked.fileId === file.node.id && marked.version === file.version}
          {@const range = marked.range}
          <div class='grid gap-1.5 border-t border-base-300 pt-3'>
            <p role='status'>{m.gallery_code_workspace_analysis_marked({
              range: formatLines(range),
            })}</p>
            <Button variant='ghost' size='xs' class='justify-self-start' onclick={() => reveal(range)}>
              {m.gallery_code_workspace_show_selection()}
            </Button>
          </div>
        {/if}
      </div>
    {/snippet}

    {#snippet annotationIcon({ annotation })}
      {#if annotation.tone === 'error'}
        <span class='icon-[tabler--alert-triangle] size-3.5'></span>
      {:else}
        <span class='icon-[tabler--git-commit] size-3.5'></span>
      {/if}
    {/snippet}

    {#snippet annotationHover({ annotation })}
      <div class='grid gap-1.5'>
        <strong>{annotation.label}</strong>
        <Button variant='ghost' size='xs' class='justify-self-start' onclick={() => showReviewTip = !showReviewTip}>
          {m.gallery_code_workspace_review_tip()}
        </Button>
        {#if showReviewTip}
          <p>{m.gallery_code_workspace_review_tip_body()}</p>
        {/if}
      </div>
    {/snippet}

    {#snippet selectionActions({ file, selection, openInspector })}
      <Button
        variant='ghost'
        size='xs'
        onclick={() => {
          marked = { fileId: file.node.id, version: file.version, range: selection.range }
          openInspector()
        }}
      >
        <span class='icon-[tabler--flag] size-3.5' aria-hidden='true'></span>
        {m.gallery_code_workspace_mark()}
      </Button>
    {/snippet}
  </CodeWorkspace>
</div>
