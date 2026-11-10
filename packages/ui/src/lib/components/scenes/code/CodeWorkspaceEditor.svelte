<script module lang='ts'>
  type Runtime = typeof import('./code-editor.js')
  let runtimePromise: Promise<Runtime> | undefined

  function loadRuntime(locale: string): Promise<Runtime> {
    return runtimePromise ??= (async () => {
      // Monaco 在首次加载时读取页面级语言包。遵循宿主已有的 Monaco 语言设置。
      if (!('_VSCODE_NLS_MESSAGES' in globalThis)) {
        const language = locale.toLowerCase().split('-')[0]
        if (language === 'zh')
          await import('monaco-editor/nls/lang/zh-cn.js')
        else if (language === 'ja')
          await import('monaco-editor/nls/lang/ja.js')
      }
      return import('./code-editor.js')
    })()
  }
</script>

<script lang='ts'>
  import type { IDisposable, editor as MonacoEditor } from 'monaco-editor'
  import type { Snippet } from 'svelte'
  import type {
    CodeWorkspaceAnnotationContext,
    CodeWorkspaceDisplay,
    CodeWorkspaceFile,
    CodeWorkspaceRange,
    CodeWorkspaceSelection,
    CodeWorkspaceSelectionContext,
    CodeWorkspaceTheme,
  } from './code-types.js'
  import { onMount, tick, untrack } from 'svelte'
  import { getUILocale, uiM } from '../../../messages.js'
  import { isMobile } from '../../../utils/platform.svelte.js'
  import Button from '../../primitives/Button.svelte'
  import CodeWorkspaceGutter from './CodeWorkspaceGutter.svelte'

  interface Props {
    file: CodeWorkspaceFile
    options: CodeWorkspaceDisplay
    theme: CodeWorkspaceTheme
    navigation?: { range: CodeWorkspaceRange, request: number, focus?: boolean }
    annotationIcon?: Snippet<[CodeWorkspaceAnnotationContext]>
    annotationHover?: Snippet<[CodeWorkspaceAnnotationContext]>
    selectionActions?: Snippet<[CodeWorkspaceSelectionContext]>
    onselection: (selection: CodeWorkspaceSelection | null) => void
    onready?: (ready: boolean) => void
    locale?: string
  }

  const {
    file,
    options,
    theme,
    navigation,
    annotationIcon,
    annotationHover,
    selectionActions,
    onselection,
    onready,
    locale = getUILocale(),
  }: Props = $props()

  const editorId = $props.id()
  type PlainView = { top: number, left: number, start: number, end: number }
  const viewLimit = 24
  const editorViews = new Map<string, MonacoEditor.ICodeEditorViewState>()
  const plainViews = new Map<string, PlainView>()
  const fileKey = $derived(JSON.stringify([file.node.id, file.version ?? file.node.version ?? '']))
  const interactiveAnnotations = $derived(file.annotations?.filter(annotation =>
    annotation.display !== 'range' && (annotation.hoverText !== undefined || annotationIcon || annotationHover),
  ) ?? [])
  const editorLabel = $derived(`${uiM('code_editor', undefined, locale)} · ${file.node.name}`)
  const plainText = $derived(file.text.replace(/\r\n?/g, '\n'))
  const lineStarts = $derived([
    0,
    ...Array.from(plainText.matchAll(/\n/g), match => match.index + 1),
  ])

  let host: HTMLDivElement | undefined = $state()
  let editorHost: HTMLDivElement
  let plain: HTMLTextAreaElement | undefined = $state()
  let actions: HTMLDivElement | undefined = $state()
  let actionsWidth = $state(0)
  let actionsHeight = $state(0)
  let editor = $state.raw<MonacoEditor.IStandaloneCodeEditor>()
  let runtime: Runtime | undefined
  let collection: MonacoEditor.IEditorDecorationsCollection | undefined
  let mode = $state<'loading' | 'editor' | 'plain'>('loading')
  let selection = $state<CodeWorkspaceSelection | null>(null)
  let anchor = $state<{ top: number, left: number, height: number } | null>(null)
  let currentFileKey: string | undefined
  let currentText: string | undefined
  let currentLanguage: string | undefined
  let currentPlainKey: string | undefined
  let lastNavigation: number | undefined
  let changeFromWorkspace = false
  let actionsDismissed = $state(false)
  let plainTool = $state<'find' | 'goto' | null>(null)
  let plainInput: HTMLInputElement | undefined = $state()
  let plainQuery = $state('')
  let plainFindIndex = $state(-1)
  const plainMatches = $derived.by(() => {
    if (plainTool !== 'find' || !plainQuery)
      return []
    const offsets: number[] = []
    let start = plainText.indexOf(plainQuery)
    while (start !== -1) {
      offsets.push(start)
      start = plainText.indexOf(plainQuery, start + plainQuery.length)
    }
    return offsets
  })

  const canShowActions = $derived(!!selectionActions && !!selection && !actionsDismissed && (mode === 'plain' || !!anchor))
  const actionsLeft = $derived(anchor && host
    ? Math.max(4, Math.min(anchor.left, host.clientWidth - actionsWidth - 4))
    : undefined)
  const actionsTop = $derived(anchor
    ? (anchor.top > actionsHeight + 6
      ? anchor.top - actionsHeight - 4
      : anchor.top + anchor.height + 4)
    : undefined)

  function remember<T>(views: Map<string, T>, key: string, value: T): void {
    views.delete(key)
    views.set(key, value)
    if (views.size > viewLimit) {
      const oldest = views.keys().next().value
      if (oldest !== undefined)
        views.delete(oldest)
    }
  }

  function publish(next: CodeWorkspaceSelection | null): void {
    selection = next
    actionsDismissed = false
    untrack(() => onselection(next))
  }

  function readEditorSelection(): void {
    if (changeFromWorkspace || !editor)
      return
    const selected = editor.getSelection()
    const model = editor.getModel()
    if (selected && model && !selected.isEmpty()) {
      publish({
        range: {
          startLine: selected.startLineNumber,
          startColumn: selected.startColumn,
          endLine: selected.endLineNumber,
          endColumn: selected.endColumn,
        },
        text: model.getValueInRange(selected),
      })
    }
    else {
      publish(null)
    }
    positionActions()
  }

  function positionActions(): void {
    const instance = editor
    const cursor = instance?.getPosition()
    if (!cursor || !instance || instance.getSelection()?.isEmpty()) {
      anchor = null
      return
    }
    const position = instance.getScrolledVisiblePosition(cursor)
    const layout = instance.getLayoutInfo()
    anchor = position && position.top >= 0 && position.top < layout.height
      ? {
        top: position.top,
        left: Math.max(layout.contentLeft, Math.min(position.left, layout.contentLeft + layout.contentWidth)),
        height: position.height,
      }
      : null
  }

  function themeChanged(): void {
    if (editor && runtime && host)
      runtime.editor.setTheme(runtime.workspaceThemeName(theme, host))
  }

  function syncModel(next: CodeWorkspaceFile, key: string): void {
    if (!editor || !runtime)
      return

    const previous = editor.getModel()
    if (previous && currentFileKey === key && currentText === next.text && currentLanguage === next.language)
      return

    const view = editor.saveViewState()
    if (currentFileKey !== undefined && view)
      remember(editorViews, currentFileKey, view)

    changeFromWorkspace = true
    try {
      collection?.clear()
      editor.setModel(null)
      previous?.dispose()
      const uri = runtime.Uri.from({
        scheme: 'inmemory',
        authority: `hai-code-workspace-${editorId}`,
        path: `/${next.node.name}`,
        query: key,
      })
      editor.setModel(runtime.editor.createModel(next.text, next.language, uri))
      const saved = editorViews.get(key)
      if (saved)
        editor.restoreViewState(saved)
      currentFileKey = key
      currentText = next.text
      currentLanguage = next.language
    }
    finally {
      changeFromWorkspace = false
    }
    readEditorSelection()
  }

  function monacoRange(range: CodeWorkspaceRange): import('monaco-editor').IRange {
    return {
      startLineNumber: range.startLine,
      startColumn: range.startColumn,
      endLineNumber: range.endLine,
      endColumn: range.endColumn,
    }
  }

  function syncAnnotations(next: CodeWorkspaceFile): void {
    if (!editor || !collection)
      return
    const model = editor.getModel()
    if (!model)
      return

    const decorations: MonacoEditor.IModelDeltaDecoration[] = []
    for (const annotation of next.annotations ?? []) {
      const range = model.validateRange(monacoRange(annotation.range))
      const tone = annotation.tone ?? 'neutral'
      const display = annotation.display ?? 'gutter'
      if (display !== 'range') {
        // 排除跨行区间终点所在的空行前缀。
        const gutterRange = range.endColumn === 1 && range.endLineNumber > range.startLineNumber
          ? {
            ...range,
            endLineNumber: range.endLineNumber - 1,
            endColumn: model.getLineMaxColumn(range.endLineNumber - 1),
          }
          : range
        decorations.push({
          range: gutterRange,
          options: {
            linesDecorationsClassName: `hai-code-gutter hai-code-${tone}`,
            linesDecorationsTooltip: annotation.label,
          },
        })
      }
      if (display !== 'gutter') {
        decorations.push({
          range,
          options: {
            className: `hai-code-range hai-code-${tone}`,
            isWholeLine: range.isEmpty(),
          },
        })
      }
    }
    collection.set(decorations)
  }

  function offsetAt(line: number, column: number): number {
    const i = Math.max(0, Math.min(lineStarts.length - 1, line - 1))
    const end = i + 1 < lineStarts.length
      ? lineStarts[i + 1] - 1
      : plainText.length
    return Math.max(lineStarts[i], Math.min(end, lineStarts[i] + column - 1))
  }

  function positionAt(offset: number): { line: number, column: number } {
    let low = 0
    let high = lineStarts.length
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (lineStarts[middle] > offset)
        high = middle
      else
        low = middle
    }
    return { line: low + 1, column: offset - lineStarts[low] + 1 }
  }

  function rememberPlainView(): void {
    if (plain && currentPlainKey !== undefined) {
      remember(plainViews, currentPlainKey, {
        top: plain.scrollTop,
        left: plain.scrollLeft,
        start: plain.selectionStart,
        end: plain.selectionEnd,
      })
    }
  }

  function readPlainSelection(): void {
    if (!plain || plain.selectionStart === plain.selectionEnd) {
      publish(null)
      return
    }
    const start = positionAt(plain.selectionStart)
    const end = positionAt(plain.selectionEnd)
    publish({
      range: {
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      },
      text: plainText.slice(plain.selectionStart, plain.selectionEnd),
    })
  }

  function restorePlainView(node: HTMLTextAreaElement, key: string): void {
    currentPlainKey = key
    const previous = plainViews.get(key)
    node.setSelectionRange(previous?.start ?? 0, previous?.end ?? 0)
    node.scrollTop = previous?.top ?? 0
    node.scrollLeft = previous?.left ?? 0
    readPlainSelection()
  }

  function revealPlain(start: number, end: number, focus = false): void {
    if (!plain)
      return
    plain.setSelectionRange(start, end)
    const lineHeight = Number.parseFloat(getComputedStyle(plain).lineHeight)
    plain.scrollTop = Math.max(0, positionAt(start).line - 2) * lineHeight
    if (focus)
      plain.focus({ preventScroll: true })
    readPlainSelection()
  }

  function applyNavigation(next: NonNullable<Props['navigation']>): void {
    if (lastNavigation === next.request)
      return
    if (editor) {
      const range = editor.getModel()?.validateRange(monacoRange(next.range))
      if (!range)
        return
      editor.setSelection(range)
      editor.revealRangeInCenterIfOutsideViewport(range)
      if (next.focus)
        editor.focus()
    }
    else if (plain) {
      revealPlain(
        offsetAt(next.range.startLine, next.range.startColumn),
        offsetAt(next.range.endLine, next.range.endColumn),
        next.focus,
      )
    }
    else {
      return
    }
    lastNavigation = next.request
    actionsDismissed = true
  }

  function showPlainTool(tool: NonNullable<typeof plainTool>): void {
    if (mode !== 'plain')
      return
    plainTool = tool
    plainQuery = ''
    plainFindIndex = -1
    void tick().then(() => plainInput?.focus())
  }

  /** 打开当前文件查找入口。 */
  export function find(): void {
    if (editor)
      void editor.getAction('actions.find')?.run()
    else
      showPlainTool('find')
  }

  /** 打开当前文件跳行入口。 */
  export function goToLine(): void {
    if (editor) {
      // Monaco 的跳行控件挂到当前聚焦的编辑器，工具栏按钮需先交回焦点。
      editor.focus()
      void editor.getAction('editor.action.gotoLine')?.run()
    }
    else {
      showPlainTool('goto')
    }
  }

  function applyPlainTool(reverse = false): void {
    if (plainTool === 'find' && plainMatches.length) {
      const count = plainMatches.length
      plainFindIndex = plainFindIndex < 0
        ? (reverse
          ? count - 1
          : 0)
        : (plainFindIndex + (reverse
          ? -1
          : 1) + count) % count
      const start = plainMatches[plainFindIndex]
      revealPlain(start, start + plainQuery.length)
    }
    else if (plainTool === 'goto') {
      const line = plainInput?.valueAsNumber
      if (!line || !plainInput?.reportValidity())
        return
      const start = offsetAt(line, 1)
      revealPlain(start, start, true)
      plainTool = null
    }
  }

  function focusActions(): void {
    actionsDismissed = false
    void tick().then(() => {
      const focusable = actions?.querySelector<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]',
      )
      const target = focusable ?? actions
      target?.focus()
    })
  }

  function handleKeyboard(event: KeyboardEvent): void {
    if (event.altKey && event.shiftKey && event.key === 'Enter' && selectionActions && selection) {
      event.preventDefault()
      event.stopPropagation()
      focusActions()
    }
    else if (event.key === 'Escape' && actions
      && (actions.contains(document.activeElement) || editor?.hasTextFocus() || plain === document.activeElement)) {
      event.preventDefault()
      event.stopPropagation()
      actionsDismissed = true
      if (editor)
        editor.focus()
      else
        plain?.focus()
    }
    else if (mode !== 'loading' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'g' || (mode === 'plain' && key === 'f')) {
        event.preventDefault()
        event.stopPropagation()
        if (key === 'g')
          goToLine()
        else
          find()
      }
    }
  }

  onMount(() => {
    let disposed = false
    let cleanupEditor: (() => void) | undefined
    const container = host
    if (!container || isMobile()) {
      mode = 'plain'
      onready?.(true)
    }
    else {
      void loadRuntime(locale).then((module) => {
        if (disposed)
          return
        runtime = module
        const created = module.editor.create(editorHost, {
          model: null,
          theme: module.workspaceThemeName(theme, container),
          autoDetectHighContrast: false,
          readOnly: true,
          domReadOnly: true,
          automaticLayout: true,
          tabFocusMode: true,
          scrollBeyondLastLine: false,
          renderValidationDecorations: 'off',
          links: false,
          dragAndDrop: false,
          dropIntoEditor: { enabled: false },
          padding: { top: 8, bottom: 8 },
        })
        const events: IDisposable[] = [
          created.onDidChangeCursorSelection(readEditorSelection),
          created.onDidLayoutChange(positionActions),
          created.onDidScrollChange(positionActions),
        ]
        const observer = new MutationObserver(() => {
          if (theme === 'inherit')
            themeChanged()
        })
        // 跟随宿主的容器主题及浏览器系统外观切换。
        for (let node: HTMLElement | null = container; node; node = node.parentElement) {
          observer.observe(node, {
            attributes: true,
            attributeFilter: ['data-theme', 'class', 'style'],
          })
        }
        const colorQueries = [
          matchMedia('(prefers-color-scheme: dark)'),
          matchMedia('(forced-colors: active)'),
        ]
        for (const query of colorQueries)
          query.addEventListener('change', themeChanged)
        cleanupEditor = () => {
          observer.disconnect()
          for (const query of colorQueries)
            query.removeEventListener('change', themeChanged)
          for (const event of events)
            event.dispose()
          const model = created.getModel()
          created.dispose()
          model?.dispose()
        }

        collection = created.createDecorationsCollection()
        editor = created
        mode = 'editor'
        onready?.(true)
      }).catch(() => {
        cleanupEditor?.()
        cleanupEditor = undefined
        if (!disposed) {
          editor = undefined
          mode = 'plain'
          onready?.(true)
        }
      })
    }
    return () => {
      disposed = true
      cleanupEditor?.()
      onready?.(false)
    }
  })

  $effect(() => {
    const next = file
    const key = fileKey
    if (editor) {
      // 确保即使宿主只更新标注数组也会重新渲染。
      syncModel(next, key)
      syncAnnotations(next)
    }
  })

  $effect(() => {
    const label = editorLabel
    const { lineNumbers, minimap, wordWrap } = options
    editor?.updateOptions({
      ariaLabel: label,
      lineNumbers: lineNumbers === 'relative'
        ? 'relative'
        : lineNumbers === false
        ? 'off'
        : 'on',
      minimap: { enabled: minimap !== false },
      glyphMargin: interactiveAnnotations.length > 0,
      wordWrap: wordWrap ? 'on' : 'off',
    })
  })

  $effect(() => {
    themeChanged()
  })

  $effect.pre(() => {
    const key = fileKey
    if (mode === 'plain' && currentPlainKey !== undefined && currentPlainKey !== key)
      untrack(rememberPlainView)
  })

  $effect(() => {
    const target = navigation
    const key = fileKey
    const node = plain
    if (mode === 'plain' && node && key !== currentPlainKey)
      untrack(() => restorePlainView(node, key))
    if (target && mode !== 'loading')
      untrack(() => applyNavigation(target))
  })
</script>

<div bind:this={host} class='hai-code-editor' onkeydowncapture={handleKeyboard}>
  <div class='hai-code-editor-surface' bind:this={editorHost} hidden={mode !== 'editor'}></div>
  {#if mode === 'loading'}
    <p class='hai-code-editor-message' role='status'>{uiM('code_editorLoading', undefined, locale)}</p>
  {:else if mode === 'plain'}
    <p class='hai-code-editor-message' role='status'>{uiM('code_editorFallback', undefined, locale)}</p>
    {#if plainTool}
      <form class='hai-code-plain-tools' onsubmit={(event) => {
        event.preventDefault()
        applyPlainTool()
      }}>
        {#if plainTool === 'find'}
          <input
            bind:this={plainInput}
            bind:value={plainQuery}
            aria-label={uiM('code_find', undefined, locale)}
            class='input input-bordered input-sm'
            type='search'
            oninput={() => { plainFindIndex = -1 }}
            onkeydown={(event) => {
              if (event.key === 'Enter' && event.shiftKey) {
                event.preventDefault()
                applyPlainTool(true)
              }
            }}
          />
          <output aria-live='polite'>{plainFindIndex + 1}/{plainMatches.length}</output>
        {:else}
          <input
            bind:this={plainInput}
            aria-label={uiM('code_goto', undefined, locale)}
            class='input input-bordered input-sm'
            type='number'
            min='1'
            max={lineStarts.length}
            required
          />
        {/if}
        <Button size='sm' type='submit' variant='ghost'>{uiM(plainTool === 'find'
          ? 'code_find'
          : 'code_goto', undefined, locale)}</Button>
        <Button size='sm' variant='ghost' onclick={() => {
          plainTool = null
          plain?.focus()
        }}>{uiM('code_close', undefined, locale)}</Button>
      </form>
    {/if}
    <textarea
      bind:this={plain}
      aria-label={editorLabel}
      class='hai-code-plain'
      readonly
      spellcheck='false'
      wrap={options.wordWrap ? 'soft' : 'off'}
      value={plainText}
      onselect={readPlainSelection}
      onpointerup={readPlainSelection}
    ></textarea>
  {/if}
  {#if editor && interactiveAnnotations.length}
    {#key fileKey}
      <CodeWorkspaceGutter {editor} {file} annotations={interactiveAnnotations} {annotationIcon} {annotationHover} />
    {/key}
  {/if}
  {#if canShowActions && selection && selectionActions}
    <div
      bind:this={actions}
      bind:offsetWidth={actionsWidth}
      bind:offsetHeight={actionsHeight}
      class='hai-code-selection-actions'
      class:plain-actions={mode === 'plain'}
      style:top={actionsTop === undefined
        ? undefined
        : `${actionsTop}px`}
      style:left={actionsLeft === undefined
        ? undefined
        : `${actionsLeft}px`}
      role='group'
      aria-label={uiM('code_selectionActions', undefined, locale)}
      aria-keyshortcuts='Alt+Shift+Enter'
      tabindex='-1'
    >
      {@render selectionActions({ file, selection })}
    </div>
  {/if}
</div>

<style>
  .hai-code-editor { position: relative; min-block-size: 0; min-inline-size: 0; flex: 1; display: flex; flex-direction: column; }
  .hai-code-editor-surface { position: absolute; inset: 0; }
  .hai-code-editor-message { margin: 0; padding: 0.6rem 0.75rem; color: color-mix(in srgb, var(--color-base-content) 68%, transparent); font-size: 0.8125rem; }
  .hai-code-plain { flex: 1; min-block-size: 8rem; resize: none; padding: 0.65rem 0.75rem; border: 0; background: var(--color-base-100); color: var(--color-base-content); font: 0.875rem/1.5 ui-monospace, monospace; tab-size: 2; }
  .hai-code-plain-tools { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; padding: 0.25rem 0.5rem; }
  .hai-code-plain-tools input { flex: 1 1 6rem; min-inline-size: 0; }
  .hai-code-selection-actions { position: absolute; z-index: 7; max-inline-size: calc(100% - 0.5rem); display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--color-base-300); border-radius: var(--radius-box); background: var(--color-base-100); color: var(--color-base-content); box-shadow: 0 3px 10px color-mix(in srgb, var(--color-base-content) 20%, transparent); }
  .plain-actions { inset-block-start: 0.25rem; inset-inline-end: 0.25rem; }
  .hai-code-editor :global(.hai-code-neutral) { --hai-annotation-color: var(--color-base-content); }
  .hai-code-editor :global(.hai-code-info) { --hai-annotation-color: var(--color-info); }
  .hai-code-editor :global(.hai-code-success) { --hai-annotation-color: var(--color-success); }
  .hai-code-editor :global(.hai-code-warning) { --hai-annotation-color: var(--color-warning); }
  .hai-code-editor :global(.hai-code-error) { --hai-annotation-color: var(--color-error); }
  .hai-code-editor :global(.hai-code-gutter) { border-inline-start: 3px solid var(--hai-annotation-color); }
  .hai-code-editor :global(.hai-code-range) { background-color: color-mix(in srgb, var(--hai-annotation-color) 23%, transparent); }
</style>
