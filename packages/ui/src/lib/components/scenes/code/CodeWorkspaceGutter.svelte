<script lang='ts'>
  import type { editor as MonacoEditor } from 'monaco-editor'
  import type { Snippet } from 'svelte'
  import type { CodeWorkspaceAnnotation, CodeWorkspaceAnnotationContext, CodeWorkspaceFile } from './code-types.js'
  import { onDestroy, tick, untrack } from 'svelte'
  import { SvelteMap, SvelteSet } from 'svelte/reactivity'

  /**
   * 渲染当前文件在 Monaco 行前区域的交互标记。
   *
   * @example 模块内部上下文
   * ```ts
   * function hasMarks({ annotations }: Props): boolean {
   *   return annotations.length > 0
   * }
   * ```
   */
  interface Props {
    editor: MonacoEditor.IStandaloneCodeEditor
    file: CodeWorkspaceFile
    annotations: readonly CodeWorkspaceAnnotation[]
    annotationIcon?: Snippet<[CodeWorkspaceAnnotationContext]>
    annotationHover?: Snippet<[CodeWorkspaceAnnotationContext]>
  }

  const { editor, file, annotations, annotationIcon, annotationHover }: Props = $props()
  const id = $props.id()
  const byLine = $derived.by(() => {
    const groups = new SvelteMap<number, CodeWorkspaceAnnotation[]>()
    for (const annotation of annotations) {
      const line = annotation.range.startLine
      const group = groups.get(line)
      if (group)
        group.push(annotation)
      else
        groups.set(line, [annotation])
    }
    return groups
  })

  let layout = $state.raw({
    left: 0,
    width: 0,
    height: 0,
    lineHeight: 0,
    rows: [] as { line: number, top: number }[],
  })
  let currentLine = $state<number>()
  let trigger = $state<HTMLButtonElement>()
  let panel = $state<HTMLDivElement>()
  let panelHeight = $state(0)
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let suppressFocus = false
  const activeRow = $derived(layout.rows.find(row => row.line === currentLine))
  const popupTop = $derived(activeRow
    ? Math.max(4, Math.min(activeRow.top, layout.height - panelHeight - 4))
    : 0)

  $effect(() => {
    const instance = editor
    const groups = byLine
    function refresh() {
      const info = instance.getLayoutInfo()
      const rows: { line: number, top: number }[] = []
      const scrollTop = instance.getScrollTop()
      const lineHeight = instance.getLineHeightForPosition({ lineNumber: 1, column: 1 })
      const seen = new SvelteSet<number>()
      for (const range of instance.getVisibleRanges()) {
        for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
          if (!groups.has(line) || seen.has(line))
            continue
          seen.add(line)
          const top = instance.getTopForLineNumber(line, true) - scrollTop
          if (top < info.height && top + lineHeight > 0)
            rows.push({ line, top })
        }
      }
      layout = {
        left: info.glyphMarginLeft,
        width: info.glyphMarginWidth,
        height: info.height,
        lineHeight,
        rows,
      }
      if (untrack(() => currentLine !== undefined && !rows.some(row => row.line === currentLine)))
        dismiss()
    }
    const listeners = [
      instance.onDidScrollChange(refresh),
      instance.onDidLayoutChange(refresh),
      instance.onDidChangeModel(refresh),
      instance.onDidChangeHiddenAreas(refresh),
      instance.onDidChangeConfiguration(refresh),
    ]
    untrack(refresh)
    return () => {
      for (const listener of listeners)
        listener.dispose()
    }
  })

  function cancelClose() {
    clearTimeout(closeTimer)
  }

  function dismiss(restoreFocus = false) {
    cancelClose()
    currentLine = undefined
    if (restoreFocus && trigger?.isConnected) {
      suppressFocus = true
      trigger.focus({ preventScroll: true })
      suppressFocus = false
    }
    trigger = undefined
  }

  function show(line: number, button: HTMLButtonElement) {
    if (suppressFocus)
      return
    cancelClose()
    trigger = button
    currentLine = line
  }

  function closeSoon() {
    cancelClose()
    closeTimer = setTimeout(() => {
      if (document.activeElement !== trigger && !panel?.contains(document.activeElement))
        dismiss()
    }, 150)
  }

  async function activate(line: number, button: HTMLButtonElement) {
    show(line, button)
    await tick()
    if (currentLine === line) {
      const first = panel?.querySelector<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')
      const target = first ?? panel
      target?.focus({ preventScroll: true })
    }
  }

  function onEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || currentLine === undefined)
      return
    const focused = document.activeElement
    const ownsFocus = focused === trigger || Boolean(panel?.contains(focused))
    if (ownsFocus) {
      event.preventDefault()
      event.stopPropagation()
    }
    dismiss(ownsFocus)
  }

  function onFocusOut(event: FocusEvent) {
    if (event.relatedTarget === trigger
      || (event.relatedTarget instanceof Node && panel?.contains(event.relatedTarget))) {
      return
    }
    closeSoon()
  }

  onDestroy(cancelClose)
</script>

<svelte:window onkeydowncapture={onEscape} />

<div class='annotation-layer'>
  {#if layout.width}
    {#each layout.rows as { line, top } (line)}
      {@const marks = byLine.get(line) ?? []}
      <button
        type='button'
        class='annotation-button'
        style:left={`${layout.left}px`}
        style:top={`${top}px`}
        style:width={`${layout.width}px`}
        style:height={`${layout.lineHeight}px`}
        aria-label={marks.map(mark => mark.label).join(' · ')}
        aria-expanded={currentLine === line}
        aria-controls={currentLine === line
          ? id
          : undefined}
        onpointerenter={event => show(line, event.currentTarget)}
        onpointerleave={closeSoon}
        onfocus={event => show(line, event.currentTarget)}
        onfocusout={onFocusOut}
        onclick={event => void activate(line, event.currentTarget)}
      >
        {#each marks as annotation, index (index)}
          <span class='annotation-icon' data-tone={annotation.tone ?? 'neutral'} aria-hidden='true'>
            {#if annotationIcon}
              {@render annotationIcon({ file, annotation })}
            {:else}
              <span class='annotation-dot'></span>
            {/if}
          </span>
        {/each}
      </button>
    {/each}
  {/if}
  {#if activeRow}
    <div
      {id}
      bind:this={panel}
      bind:offsetHeight={panelHeight}
      class='annotation-panel'
      role='group'
      aria-label={trigger?.getAttribute('aria-label') ?? undefined}
      tabindex='-1'
      style:left={`${layout.left + layout.width + 4}px`}
      style:top={`${popupTop}px`}
      style:max-height={`${Math.max(0, layout.height - 8)}px`}
      onpointerenter={cancelClose}
      onpointerleave={closeSoon}
      onfocusout={onFocusOut}
    >
      {#each byLine.get(activeRow.line) ?? [] as annotation, index (index)}
        <div>
          {#if annotation.hoverText !== undefined}
            {annotation.hoverText}
          {:else if annotationHover}
            {@render annotationHover({ file, annotation })}
          {:else}
            {annotation.label}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .annotation-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: clip; }
  .annotation-button { position: absolute; display: flex; align-items: center; justify-content: center; gap: 1px; padding: 0; cursor: pointer; pointer-events: auto; }
  .annotation-button:hover, .annotation-button:focus-visible { background: color-mix(in srgb, var(--color-primary) 18%, transparent); }
  .annotation-button:focus-visible { outline: 1px solid var(--color-primary); outline-offset: -1px; }
  .annotation-icon { display: grid; place-items: center; min-width: 0; color: var(--color-base-content); }
  .annotation-icon[data-tone='info'] { color: var(--color-info); }
  .annotation-icon[data-tone='success'] { color: var(--color-success); }
  .annotation-icon[data-tone='warning'] { color: var(--color-warning); }
  .annotation-icon[data-tone='error'] { color: var(--color-error); }
  .annotation-icon :global(svg) { max-width: 100%; width: 0.875rem; height: 0.875rem; }
  .annotation-dot { width: .45rem; height: .45rem; border-radius: 100%; background: currentColor; }
  .annotation-panel { position: absolute; display: grid; gap: .35rem; max-width: min(24rem, calc(100% - 3rem)); overflow: auto; border: 1px solid var(--color-base-300); border-radius: var(--radius-box); background: var(--color-base-100); color: var(--color-base-content); padding: .5rem .65rem; box-shadow: 0 3px 12px color-mix(in srgb, var(--color-base-content) 18%, transparent); font-size: .8125rem; overflow-wrap: anywhere; pointer-events: auto; }
</style>
