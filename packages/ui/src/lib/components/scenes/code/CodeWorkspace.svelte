<!--
  @component CodeWorkspace
  支持异步文件树、标签页、搜索和宿主检查面板的只读代码工作区。

  @example
  ```svelte
  <script lang='ts'>
    import type { CodeWorkspaceSource } from '@h-ai/ui/components/scenes/code/index'
    import { CodeWorkspace } from '@h-ai/ui/components/scenes/code/index'
    const source: CodeWorkspaceSource = {
      listChildren: () => [{ kind: 'file', id: 'readme', name: 'README.md' }],
      readFile: () => ({ text: '# Hello', language: 'markdown' }),
    }
  </script>
  <CodeWorkspace {source} />
  ```
-->
<script lang='ts'>
  import type {
    CodeWorkspaceDisplay,
    CodeWorkspaceFile,
    CodeWorkspaceFileNode,
    CodeWorkspaceFolder,
    CodeWorkspaceProps,
    CodeWorkspaceRange,
    CodeWorkspaceSearchHit,
    CodeWorkspaceSearchQuery,
    CodeWorkspaceSelection,
    CodeWorkspaceSelectionContext,
    CodeWorkspaceSource,
    CodeWorkspaceTheme,
  } from './code-types.js'
  import { tick, untrack } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { focusDialog, handleDialogKeydown } from '../../../internal/dialog-focus.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import Button from '../../primitives/Button.svelte'
  import Spinner from '../../primitives/Spinner.svelte'
  import CodeWorkspaceEditor from './CodeWorkspaceEditor.svelte'
  import CodeWorkspaceSearch from './CodeWorkspaceSearch.svelte'
  import CodeWorkspaceTree from './CodeWorkspaceTree.svelte'

  type Side = 'left' | 'right'
  type SearchMode = CodeWorkspaceSearchQuery['mode']
  type Preset = Exclude<CodeWorkspaceTheme, object>

  interface Tab {
    key: string
    node: CodeWorkspaceFileNode
    ancestors: readonly CodeWorkspaceFolder[]
    file?: CodeWorkspaceFile
    failed?: boolean
  }

  interface Location {
    key: string
    range: CodeWorkspaceRange
    version?: string
    request: number
    focus: boolean
  }

  const {
    source,
    initialFile,
    initialAncestors = [],
    options = {},
    theme = 'inherit',
    inspector,
    annotationIcon,
    annotationHover,
    selectionActions,
    height = '38rem',
    label,
    class: className,
  }: CodeWorkspaceProps = $props()

  const id = $props.id()
  const presets = {
    'inherit': 'code_themeInherit',
    'vs-light': 'code_themeLight',
    'vs-dark': 'code_themeDark',
    'hc-light': 'code_themeHighContrastLight',
    'hc-dark': 'code_themeHighContrastDark',
    'github-dark': 'code_themeGithubDark',
  } as const

  let width = $state(0)
  let tabList = $state<HTMLDivElement>()
  let leftPanel = $state<HTMLDivElement>()
  let rightPanel = $state<HTMLDivElement>()
  let treeToggle = $state<HTMLButtonElement>()
  let inspectorToggle = $state<HTMLButtonElement>()
  let editor = $state<ReturnType<typeof CodeWorkspaceEditor>>()
  let editorReady = $state(false)
  let search = $state<ReturnType<typeof CodeWorkspaceSearch>>()
  let tabs = $state.raw<Tab[]>([])
  let activeKey = $state<string>()
  let selectionSnapshot = $state.raw<{ file: CodeWorkspaceFile, selection: CodeWorkspaceSelection }>()
  let location = $state.raw<Location>()
  let reveal = $state.raw<{ ancestors: readonly CodeWorkspaceFolder[], focus?: boolean, request: number }>()
  let request = 0
  let mode = $state<SearchMode | null>(null)
  let drawer = $state<Side | null>(null)
  let leftOpen = $state(true)
  let rightOpen = $state(true)
  let leftSize = $state(215)
  let rightSize = $state(250)
  let dragging = $state<Side>()
  let drag: { x: number, width: number } | undefined
  const displayOverrides = $state<CodeWorkspaceDisplay>({})
  let themeOverride = $state<Preset | 'custom'>()
  const reads = new SvelteMap<string, AbortController>()
  const active = $derived(tabs.find(tab => tab.key === activeKey))
  const activeFile = $derived(active?.file)
  const selection = $derived(selectionSnapshot?.file === activeFile
    ? selectionSnapshot?.selection ?? null
    : null)
  // 切换到正在读取的标签时保留编辑器实例和各标签的视图状态。
  const editorFile = $derived(activeFile ?? tabs.find(tab => tab.file)?.file)
  const narrow = $derived(width > 0 && width < 710)
  const drawerPanel = $derived(narrow && drawer
    ? (drawer === 'left'
      ? leftPanel
      : rightPanel)
    : undefined)
  const leftVisible = $derived(narrow
    ? drawer === 'left'
    : leftOpen)
  const rightVisible = $derived(Boolean(inspector) && (narrow
    ? drawer === 'right'
    : rightOpen))
  const leftWidth = $derived(leftVisible && !narrow
    ? Math.min(leftSize, width
      ? width * 0.31
      : leftSize)
    : 0)
  const rightWidth = $derived(rightVisible && !narrow
    ? Math.min(rightSize, width
      ? width * 0.31
      : rightSize)
    : 0)
  const display = $derived({
    lineNumbers: true,
    minimap: true,
    breadcrumbs: true,
    wordWrap: false,
    ...options,
    ...displayOverrides,
  })
  const editorTheme = $derived(themeOverride && themeOverride !== 'custom'
    ? themeOverride
    : theme)
  const selectedTheme = $derived(themeOverride ?? (typeof theme === 'object'
    ? 'custom'
    : theme))
  const staleLocation = $derived(location?.key === activeKey && Boolean(location?.version && activeFile?.version && location.version !== activeFile.version))
  const navigation = $derived(activeFile && location?.key === activeKey && !staleLocation
    ? location
    : undefined)

  $effect(() => {
    const current = source
    untrack(() => {
      tabs = []
      activeKey = undefined
      selectionSnapshot = undefined
      location = undefined
      reveal = undefined
      mode = null
      if (initialFile)
        openFile(initialFile, initialAncestors, undefined, current)
    })
    return () => {
      for (const controller of reads.values())
        controller.abort()
      reads.clear()
    }
  })

  $effect(() => {
    void theme
    themeOverride = undefined
  })

  $effect(() => {
    return drawerPanel
      ? focusDialog(drawerPanel)
      : undefined
  })

  function activate(key: string | undefined) {
    activeKey = key
    location = undefined
    revealActiveTab()
  }

  function updateTab(tab: Tab) {
    tabs = tabs.map(previous => previous.key === tab.key
      ? tab
      : previous)
  }

  async function read(tab: Tab, current: CodeWorkspaceSource) {
    if (reads.has(tab.key))
      return
    const controller = new AbortController()
    reads.set(tab.key, controller)
    if (tab.failed)
      updateTab({ ...tab, failed: false })
    try {
      const content = await current.readFile(tab.node, controller.signal)
      if (!controller.signal.aborted && current === source) {
        const currentTab = tabs.find(item => item.key === tab.key)
        if (currentTab) {
          updateTab({
            ...currentTab,
            file: { ...content, version: content.version ?? tab.node.version, node: tab.node },
          })
        }
      }
    }
    catch {
      if (!controller.signal.aborted && current === source) {
        const currentTab = tabs.find(item => item.key === tab.key)
        if (currentTab)
          updateTab({ ...currentTab, failed: true })
      }
    }
    finally {
      if (reads.get(tab.key) === controller)
        reads.delete(tab.key)
    }
  }

  function revealAncestors(ancestors: readonly CodeWorkspaceFolder[], focus = false) {
    reveal = ancestors.length || focus
      ? { ancestors, focus, request: ++request }
      : undefined
  }

  function openFile(node: CodeWorkspaceFileNode, ancestors: readonly CodeWorkspaceFolder[] = [], range?: CodeWorkspaceRange, current = source) {
    const key = JSON.stringify([node.id, node.version])
    let tab = tabs.find(item => item.key === key)
    if (!tab) {
      tab = { key, node, ancestors }
      tabs = [...tabs, tab]
    }
    else if (ancestors.length && !tab.ancestors.length) {
      tab = { ...tab, ancestors }
      updateTab(tab)
    }

    activate(key)
    if (range) {
      location = {
        key,
        range,
        version: node.version,
        request: ++request,
        focus: true,
      }
    }
    revealAncestors(tab.ancestors)
    if (!tab.file)
      void read(tab, current)
    if (narrow)
      drawer = null
  }

  function openHit(hit: CodeWorkspaceSearchHit) {
    openFile(hit.node, hit.ancestors, hit.range)
  }

  function chooseTab(tab: Tab) {
    if (tab.key === activeKey)
      return
    activate(tab.key)
    revealAncestors(tab.ancestors)
  }

  function revealActiveTab(focus = false) {
    void tick().then(() => {
      const list = tabList
      const selected = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (focus)
        (selected ?? treeToggle)?.focus()
      if (list && selected) {
        const tab = selected.getBoundingClientRect()
        const strip = list.getBoundingClientRect()
        if (tab.left < strip.left)
          list.scrollLeft -= strip.left - tab.left
        else if (tab.right > strip.right)
          list.scrollLeft += tab.right - strip.right
      }
    })
  }

  function closeTab(tab: Tab) {
    const index = tabs.indexOf(tab)
    const next = tabs[index + 1] ?? tabs[index - 1]
    reads.get(tab.key)?.abort()
    reads.delete(tab.key)
    tabs = tabs.filter(item => item.key !== tab.key)
    if (activeKey === tab.key) {
      if (next)
        chooseTab(next)
      else
        activate(undefined)
    }
    revealActiveTab(true)
  }

  function onTabKey(event: KeyboardEvent, tab: Tab) {
    const index = tabs.indexOf(tab)
    let next: Tab | undefined
    if (event.key === 'Home')
      next = tabs[0]
    else if (event.key === 'End')
      next = tabs.at(-1)
    else if (event.key === 'ArrowLeft')
      next = tabs[(index - 1 + tabs.length) % tabs.length]
    else if (event.key === 'ArrowRight')
      next = tabs[(index + 1) % tabs.length]

    if (event.key === 'Delete') {
      event.preventDefault()
      closeTab(tab)
    }
    else if (next) {
      event.preventDefault()
      chooseTab(next)
      revealActiveTab(true)
    }
  }

  function revealRange(file: CodeWorkspaceFile, range: CodeWorkspaceRange) {
    if (active?.file !== file)
      return
    location = {
      key: active.key,
      range,
      version: file.version,
      request: ++request,
      focus: true,
    }
    if (narrow)
      drawer = null
  }

  function showSide(side: Side, open: boolean) {
    if (narrow) {
      drawer = open ? side : null
    }
    else if (side === 'left') {
      leftOpen = open
      if (!open && leftPanel?.contains(document.activeElement))
        treeToggle?.focus()
    }
    else {
      rightOpen = open
      if (!open && rightPanel?.contains(document.activeElement))
        inspectorToggle?.focus()
    }
  }

  function toggleSide(side: Side) {
    showSide(side, !(side === 'left'
      ? leftVisible
      : rightVisible))
  }

  function setMode(next: SearchMode | null) {
    mode = next
    if (next)
      void tick().then(() => search?.focus())
  }

  function showFolder(ancestors: readonly CodeWorkspaceFolder[]) {
    showSide('left', true)
    mode = null
    revealAncestors(ancestors, true)
  }

  function onWorkspaceKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || !source.search || event.altKey || !(event.ctrlKey || event.metaKey))
      return
    const key = event.key.toLowerCase()
    if ((key === 'p' && !event.shiftKey) || (key === 'f' && event.shiftKey)) {
      event.preventDefault()
      event.stopPropagation()
      showSide('left', true)
      setMode(key === 'p'
        ? 'files'
        : 'content')
    }
  }

  function workspaceShortcuts(node: HTMLElement) {
    node.addEventListener('keydown', onWorkspaceKey, true)
    return {
      destroy: () => node.removeEventListener('keydown', onWorkspaceKey, true),
    }
  }

  function resize(side: Side, size: number) {
    const other = side === 'left'
      ? rightWidth
      : leftWidth
    const limit = Math.min(360, width * 0.31, width - other - 270)
    const value = Math.round(Math.max(150, Math.min(limit, size)))
    if (side === 'left')
      leftSize = value
    else
      rightSize = value
  }

  function dragStart(event: PointerEvent, side: Side) {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement))
      return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging = side
    drag = {
      x: event.clientX,
      width: side === 'left'
        ? leftWidth
        : rightWidth,
    }
  }

  function dragMove(event: PointerEvent, side: Side) {
    if (drag && dragging === side) {
      resize(side, drag.width + (event.clientX - drag.x) * (side === 'left'
        ? 1
        : -1))
    }
  }

  function dragEnd() {
    drag = undefined
    dragging = undefined
  }

  function onSplitterKey(event: KeyboardEvent, side: Side) {
    if (event.key === 'Enter') {
      event.preventDefault()
      showSide(side, false)
      const toggle = side === 'left'
        ? treeToggle
        : inspectorToggle
      toggle?.focus()
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = (event.key === 'ArrowRight'
        ? 12
        : -12) * (side === 'left'
        ? 1
        : -1)
      resize(side, (side === 'left'
        ? leftWidth
        : rightWidth) + delta)
    }
  }

  function setTheme(event: Event) {
    if (event.currentTarget instanceof HTMLSelectElement) {
      const selected = event.currentTarget.value
      if (selected === 'custom')
        themeOverride = 'custom'
      else if (Object.hasOwn(presets, selected))
        themeOverride = selected as Preset
    }
  }

  function onSelection(next: CodeWorkspaceSelection | null) {
    selectionSnapshot = next && editorFile
      ? { file: editorFile, selection: next }
      : undefined
  }
</script>

{#snippet splitter(side: Side, size: number)}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (分隔条的键盘操作遵循 WAI-ARIA) -->
  <div
    class='splitter'
    role='separator'
    tabindex='0'
    aria-orientation='vertical'
    aria-controls={`${id}-${side}`}
    aria-label={uiM(side === 'left'
      ? 'code_resizeTree'
      : 'code_resizeInspector')}
    aria-valuemin={150}
    aria-valuemax={360}
    aria-valuenow={Math.round(size)}
    onpointerdown={event => dragStart(event, side)}
    onpointermove={event => dragMove(event, side)}
    onlostpointercapture={dragEnd}
    onkeydown={event => onSplitterKey(event, side)}
  ></div>
{/snippet}

{#snippet actions(context: CodeWorkspaceSelectionContext)}
  {@render selectionActions?.({
    ...context,
    reveal: range => revealRange(context.file, range),
    openInspector: () => {
      if (inspector && context.file === activeFile)
        showSide('right', true)
    },
  })}
{/snippet}

<section
  bind:clientWidth={width}
  class={cn('workspace', className)}
  class:narrow
  class:dragging={dragging !== undefined}
  aria-label={label ?? uiM('code_workspace')}
  style:height
  style:--left-width={`${leftWidth}px`}
  style:--right-width={`${rightWidth}px`}
  data-code-workspace
  use:workspaceShortcuts
>
  <header class='topbar'>
    <div class='workspace-title'>
      <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>
        <path d='m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18' />
      </svg>
      <strong>{label ?? uiM('code_workspace')}</strong>
    </div>
    <div class='top-actions'>
      <button
        bind:this={treeToggle}
        class='tool'
        type='button'
        aria-label={uiM('code_explorer')}
        title={uiM('code_explorer')}
        aria-expanded={leftVisible}
        aria-controls={`${id}-left`}
        onclick={() => toggleSide('left')}
      >
        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'>
          <rect x='3' y='4' width='18' height='16' rx='2' /><path d='M9 4v16' />
        </svg>
      </button>
      {#if inspector}
        <button
          bind:this={inspectorToggle}
          class='tool'
          type='button'
          aria-label={uiM('code_inspector')}
          title={uiM('code_inspector')}
          aria-expanded={rightVisible}
          aria-controls={`${id}-right`}
          onclick={() => toggleSide('right')}
        >
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'>
            <rect x='3' y='4' width='18' height='16' rx='2' /><path d='M15 4v16' />
          </svg>
        </button>
      {/if}
      <details class='settings'>
        <summary class='tool' aria-label={uiM('code_display')} title={uiM('code_display')}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'>
            <path d='M3 6h12m4 0h2M3 12h4m4 0h10M3 18h9m4 0h5M15 3v6M7 9v6m5 0v6' />
          </svg>
        </summary>
        <div class='settings-menu'>
          <label>
            <input type='checkbox' checked={display.lineNumbers !== false} onchange={event => displayOverrides.lineNumbers = event.currentTarget.checked
              ? (options.lineNumbers || true)
              : false} />
            {uiM('code_lineNumbers')}
          </label>
          <label><input type='checkbox' checked={display.minimap} onchange={event => displayOverrides.minimap = event.currentTarget.checked} />{uiM('code_minimap')}</label>
          <label><input type='checkbox' checked={display.breadcrumbs} onchange={event => displayOverrides.breadcrumbs = event.currentTarget.checked} />{uiM('code_breadcrumbs')}</label>
          <label><input type='checkbox' checked={display.wordWrap} onchange={event => displayOverrides.wordWrap = event.currentTarget.checked} />{uiM('code_wordWrap')}</label>
          <label class='theme-label'>
            {uiM('code_theme')}
            <select class='select select-sm' value={selectedTheme} onchange={setTheme}>
              {#each Object.entries(presets) as [name, message] (name)}
                <option value={name}>{uiM(message)}</option>
              {/each}
              {#if typeof theme === 'object'}
                <option value='custom'>{uiM('code_themeCustom')}</option>
              {/if}
            </select>
          </label>
        </div>
      </details>
    </div>
  </header>

  <div class='workbench'>
    {#if narrow && drawer}
      <button type='button' class='backdrop' aria-label={uiM('code_close')} tabindex='-1' onclick={() => drawer = null}></button>
    {/if}
    <div
      bind:this={leftPanel}
      id={`${id}-left`}
      class='side left'
      role={narrow ? 'dialog' : 'region'}
      aria-modal={narrow && leftVisible
        ? 'true'
        : undefined}
      aria-label={uiM('code_explorer')}
      tabindex='-1'
      hidden={!leftVisible}
      onkeydown={event => narrow && leftPanel && handleDialogKeydown(event, leftPanel, () => drawer = null)}
    >
      <div class='side-header'>
        <strong>{uiM('code_explorer')}</strong>
        {#if narrow}
          <button type='button' class='tool' aria-label={uiM('code_close')} onclick={() => drawer = null}>×</button>
        {/if}
      </div>
      {#if source.search}
        <div class='modes' role='group' aria-label={uiM('code_explorer')}>
          <button type='button' class='tool' aria-pressed={mode === null} onclick={() => setMode(null)}>{uiM('code_fileTree')}</button>
          <button type='button' class='tool' aria-pressed={mode === 'files'} onclick={() => setMode('files')}>{uiM('code_findFiles')}</button>
          <button type='button' class='tool' aria-pressed={mode === 'content'} onclick={() => setMode('content')}>{uiM('code_searchContent')}</button>
        </div>
      {/if}
      <div class='tree-scroll' hidden={mode !== null}>
        <CodeWorkspaceTree {source} activeId={active?.node.id} {reveal} onopen={openFile} />
      </div>
      <CodeWorkspaceSearch bind:this={search} {source} {mode} onopen={openHit} />
    </div>
    {#if leftVisible && !narrow}
      {@render splitter('left', leftWidth)}
    {/if}

    <div class='center' inert={narrow && drawer !== null}>
      <div class='tabs-row'>
        <div bind:this={tabList} class='file-tabs' role='tablist' aria-label={uiM('code_tabs')}>
          {#each tabs as tab, index (tab.key)}
            <div class='file-tab' class:current={tab.key === activeKey} role='presentation'>
              <button
                id={`${id}-tab-${index}`}
                class='tab-label'
                type='button'
                role='tab'
                aria-selected={tab.key === activeKey}
                aria-controls={`${id}-file`}
                tabindex={tab.key === activeKey
                  ? 0
                  : -1}
                title={[
                  ...tab.ancestors.map(folder => folder.name),
                  tab.node.name,
                ].join('/')}
                onclick={() => chooseTab(tab)}
                onkeydown={event => onTabKey(event, tab)}
              >{tab.node.name}</button>
              <button
                class='close-tab'
                type='button'
                tabindex={tab.key === activeKey
                  ? 0
                  : -1}
                aria-label={uiM('code_closeFile', { name: tab.node.name })}
                onclick={() => closeTab(tab)}
              >×</button>
            </div>
          {/each}
        </div>
      </div>
      <div class='file-toolbar'>
        {#if active && display.breadcrumbs}
          <nav class='crumbs' aria-label={uiM('code_breadcrumbs')}>
            <button type='button' class='tool root-crumb' title={uiM('code_root')} aria-label={uiM('code_root')} onclick={() => showFolder([])}>
              <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'>
                <path d='M3 5h7l2 3h9v11H3z' />
              </svg>
            </button>
            {#each active.ancestors as folder, index (folder.id)}
              <span aria-hidden='true'>/</span>
              <button type='button' class='tool' title={folder.name} onclick={() => showFolder(active!.ancestors.slice(0, index + 1))}>{folder.name}</button>
            {/each}
            <span aria-hidden='true'>/</span>
            <span class='crumb-file' aria-current='page' title={active.node.name}>{active.node.name}</span>
          </nav>
        {/if}
        <div class='file-actions'>
          <button type='button' class='tool' aria-label={uiM('code_find')} title={uiM('code_find')} disabled={!activeFile || !editorReady} onclick={() => editor?.find()}>
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'>
              <circle cx='10.5' cy='10.5' r='5.5' /><path d='m15 15 4 4' />
            </svg>
          </button>
          <button type='button' class='tool' aria-label={uiM('code_goto')} title={uiM('code_goto')} disabled={!activeFile || !editorReady} onclick={() => editor?.goToLine()}>
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>
              <path d='M5 5v10h14m-5-5 5 5-5 5' />
            </svg>
          </button>
        </div>
      </div>
      <div
        id={`${id}-file`}
        class='file-panel'
        role={active ? 'tabpanel' : undefined}
        aria-labelledby={active
          ? `${id}-tab-${tabs.indexOf(active)}`
          : undefined}
      >
        {#if staleLocation}
          <p class='file-message stale' role='status'>{uiM('code_staleLocation')}</p>
        {/if}
        {#if editorFile}
          <div class='editor-slot' hidden={!activeFile}>
            {#key source}
              <CodeWorkspaceEditor
                bind:this={editor}
                file={editorFile}
                options={display}
                theme={editorTheme}
                {navigation}
                {annotationIcon}
                {annotationHover}
                selectionActions={selectionActions ? actions : undefined}
                onselection={onSelection}
                onready={ready => editorReady = ready}
              />
            {/key}
          </div>
        {/if}
        {#if !active}
          <p class='file-message'>{uiM('code_noFile')}</p>
        {:else if active.failed}
          <div class='file-message'>
            <p role='alert'>{uiM('code_fileFailed')}</p>
            <Button size='sm' variant='ghost' onclick={() => active && void read(active, source)}>{uiM('code_retry')}</Button>
          </div>
        {:else if !activeFile}
          <p class='file-message' role='status'><Spinner size='xs' /> {uiM('code_fileLoading')}</p>
        {/if}
      </div>
      {#if activeFile}
        <footer class='statusbar'>
          <span>{uiM('code_readOnly')}</span>
          <span>{activeFile.language ?? ''}</span>
        </footer>
      {/if}
    </div>

    {#if rightVisible && !narrow}
      {@render splitter('right', rightWidth)}
    {/if}
    {#if inspector}
      <div
        bind:this={rightPanel}
        id={`${id}-right`}
        class='side right'
        role={narrow ? 'dialog' : 'region'}
        aria-modal={narrow && rightVisible
          ? 'true'
          : undefined}
        aria-label={uiM('code_inspector')}
        tabindex='-1'
        hidden={!rightVisible}
        onkeydown={event => narrow && rightPanel && handleDialogKeydown(event, rightPanel, () => drawer = null)}
      >
        <div class='side-header'>
          <strong>{uiM('code_inspector')}</strong>
          {#if narrow}
            <button type='button' class='tool' aria-label={uiM('code_close')} onclick={() => drawer = null}>×</button>
          {/if}
        </div>
        <div class='inspector-content'>
          {#if activeFile}
            {@const file = activeFile}
            {@render inspector({
              file,
              selection,
              reveal: range => revealRange(file, range),
            })}
          {:else if active && !active.failed}
            <p class='file-message' role='status'>{uiM('code_fileLoading')}</p>
          {:else}
            <p class='file-message'>{uiM('code_noFile')}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .workspace {
    --panel-border: var(--color-base-300);
    --panel-surface: var(--color-base-200);
    --selected-surface: color-mix(in srgb, var(--color-primary) 14%, var(--color-base-100));
    display: flex;
    min-width: 0;
    min-height: 18rem;
    flex-direction: column;
    color: var(--color-base-content);
    background: var(--color-base-100);
    border: 1px solid var(--panel-border);
    border-radius: .65rem;
    overflow: clip;
    font-size: .875rem;
  }
  .workspace [hidden] { display: none; }
  .topbar, .side-header, .file-toolbar, .statusbar {
    display: flex;
    min-height: 2.1rem;
    align-items: center;
    justify-content: space-between;
    gap: .35rem;
    padding: .2rem .55rem;
    border-bottom: 1px solid var(--panel-border);
  }
  .topbar { position: relative; z-index: 5; flex: none; min-height: 2.6rem; background: var(--panel-surface); }
  .workspace-title, .top-actions, .file-actions { display: flex; align-items: center; min-width: 0; gap: .35rem; }
  .workspace-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-title svg, .tool svg { width: 1rem; height: 1rem; flex: none; }
  .workspace-title svg { color: var(--color-primary); }
  .tool, .close-tab, .tab-label { cursor: pointer; border-radius: .25rem; }
  .tool { display: inline-flex; min-height: 1.7rem; align-items: center; justify-content: center; padding: .18rem .38rem; }
  .tool:not(:disabled):hover, .close-tab:hover, .tab-label:hover { background: var(--panel-border); }
  .tool[aria-pressed='true'] { background: var(--selected-surface); font-weight: 600; }
  .tool:disabled { opacity: .45; cursor: default; }
  .workspace :is(button, summary, [role='separator']):focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
  .settings { position: relative; flex: none; }
  .settings summary { list-style: none; }
  .settings summary::-webkit-details-marker { display: none; }
  .settings-menu {
    position: absolute;
    top: 100%;
    right: 0;
    width: max-content;
    max-width: min(16rem, 80vw);
    display: grid;
    gap: .4rem;
    padding: .65rem;
    border: 1px solid var(--panel-border);
    border-radius: .4rem;
    background: var(--color-base-100);
    box-shadow: 0 .4rem 1.2rem color-mix(in srgb, var(--color-base-content) 16%, transparent);
  }
  .settings-menu label { display: flex; gap: .35rem; align-items: center; }
  .settings-menu .theme-label { align-items: stretch; flex-direction: column; }
  .workbench { position: relative; isolation: isolate; display: flex; flex: 1; min-width: 0; min-height: 0; }
  .dragging .workbench { user-select: none; }
  .side { display: flex; flex: none; flex-direction: column; min-height: 0; min-width: 0; background: var(--panel-surface); }
  .left { width: var(--left-width); }
  .right { width: var(--right-width); }
  .side-header { flex: none; min-height: 2.35rem; }
  .modes { display: flex; align-items: center; flex-wrap: wrap; gap: .1rem; padding: .3rem; font-size: .73rem; }
  .modes .tool { padding-inline: .3rem; }
  .tree-scroll, .inspector-content { min-height: 0; overflow: auto; }
  .tree-scroll { flex: 1; }
  .inspector-content { padding: .55rem; }
  .splitter { flex: 0 0 5px; padding: 0; cursor: col-resize; touch-action: none; background: var(--panel-border); }
  .splitter:hover, .splitter:focus-visible { background: var(--color-primary); }
  .center { display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: column; }
  .tabs-row { min-height: 2.35rem; flex: none; border-bottom: 1px solid var(--panel-border); background: var(--panel-surface); }
  .file-tabs { display: flex; min-width: 0; min-height: 2.25rem; overflow: auto; }
  .file-tab {
    display: flex;
    flex: none;
    align-items: center;
    gap: .1rem;
    padding-inline: .22rem;
    max-width: 14rem;
    border-inline-end: 1px solid var(--panel-border);
  }
  .file-tab.current { box-shadow: inset 0 2px var(--color-primary); background: var(--color-base-100); }
  .tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: .25rem .4rem; }
  .close-tab { flex: none; padding: .12rem .36rem; font-size: 1.05rem; line-height: 1; }
  .file-toolbar { flex: none; }
  .crumbs { display: flex; min-width: 0; align-items: center; gap: .15rem; font-size: .8rem; }
  .crumbs .tool, .crumb-file { min-width: 0; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumbs .root-crumb { display: inline-flex; flex: none; }
  .crumb-file { padding-inline: .2rem; font-weight: 600; }
  .file-actions { flex: none; margin-inline-start: auto; }
  .file-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .editor-slot { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
  .editor-slot[hidden] { display: none; }
  .file-message { padding: .65rem; font-size: .84rem; }
  .stale { color: var(--color-warning-content); background: var(--color-warning); }
  .statusbar { border-top: 1px solid var(--panel-border); border-bottom: 0; min-height: 1.65rem; font-size: .75rem; background: var(--panel-surface); }
  .narrow .side {
    position: absolute;
    inset-block: 0;
    z-index: 4;
    width: min(20rem, 89%);
    box-shadow: 0 0 1rem color-mix(in srgb, var(--color-base-content) 20%, transparent);
  }
  .narrow .left { inset-inline-start: 0; }
  .narrow .right { inset-inline-end: 0; }
  .backdrop { position: absolute; z-index: 3; inset: 0; background: color-mix(in srgb, var(--color-base-content) 36%, transparent); }
  @media (pointer: coarse) {
    .top-actions .tool, .file-actions .tool { min-width: 2.5rem; min-height: 2.5rem; }
  }
</style>
