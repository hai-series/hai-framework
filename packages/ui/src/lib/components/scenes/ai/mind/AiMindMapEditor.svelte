<script lang='ts'>
  import type { LangPack } from 'mind-elixir/i18n'
  import type { AiMindMapData, AiMindMapEditorProps, AiMindMapNode, AiMindMapSelection } from './mind-types.js'
  import { en, ja, zh_CN } from 'mind-elixir/i18n'
  import { onMount } from 'svelte'
  import { getUILocale, uiM } from '../../../../messages.js'
  import { getDataAttributes } from '../../../../utils.js'
  import AiDocumentDownloadMenu from '../AiDocumentDownloadMenu.svelte'
  import { fromMindElixirData, toMindElixirData } from './mind-adapter.js'

  const {
    data,
    artifactKey,
    title = '',
    editable = true,
    dark = false,
    saveState = '',
    class: className = '',
    onchange,
    onerror,
    onexport,
    onclose,
    onimportjson,
    onselectionchange,
    onrewrite,
    ...restProps
  }: AiMindMapEditorProps = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  let canvas = $state<HTMLDivElement>()
  let importInput = $state<HTMLInputElement>()
  let engine = $state.raw<import('mind-elixir').default>()
  let loadError = $state(false)
  let lastArtifactKey = ''
  let suppressChange = false
  let lastDataSnapshot = ''
  /** 最近交给宿主的持久化快照，用于合并操作事件与历史栈事件。 */
  let lastEmittedSnapshot = ''
  let selectedNodeIds = $state<string[]>([])
  let selectedSummary = $state('')
  // 菜单命令通过另一个点击事件触发，单独保存显示菜单时命中的节点 ID。
  let contextNodeId = ''
  /** 按 Mind Elixir 公共历史栈状态启用撤销和重做按钮。 */
  let canUndo = $state(false)
  let canRedo = $state(false)
  /** 当前用户界面布局，同时用于后续引擎快照序列化。 */
  let layoutSelection = $state<'right' | 'left' | 'both'>('right')
  /** 跟随宿主主题设置更新编辑引擎的配色。 */
  let themeDark = $state(false)

  /** 把已提交到历史栈的引擎状态转换为项目协议后交给宿主保存。 */
  function emitCurrentChange(reason: string): void {
    if (!engine || !editable)
      return
    try {
      const nextData = fromMindElixirData(engine.getData(), layoutSelection)
      const nextSnapshot = JSON.stringify(nextData)
      if (nextSnapshot === lastEmittedSnapshot)
        return
      lastEmittedSnapshot = nextSnapshot
      onchange?.({ data: nextData, reason })
    }
    catch (error) {
      onerror?.(error instanceof Error
        ? error
        : new Error(String(error)))
    }
  }

  /** Mind Elixir 菜单跟随宿主当前 UI 语言，而不是引擎固定的英文默认值。 */
  function resolveContextMenuLocale(): LangPack {
    const locale = getUILocale().toLowerCase()
    if (locale.startsWith('zh'))
      return zh_CN
    if (locale.startsWith('ja'))
      return ja
    return en
  }

  /** 右键菜单和工具栏共用节点 ID，引用当前选中节点的实际文字。 */
  function requestRewrite(nodeIds = selectedNodeIds): void {
    if (!onrewrite || nodeIds.length === 0)
      return
    const text = nodeIds
      .map(id => engine?.getObjById(id, engine.nodeData)?.topic ?? findNode(data.root, id)?.text)
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n')
    if (!text)
      return
    onrewrite({ nodeIds, scope: 'subtree', text })
  }

  /** 点击右键 AI 改写时关闭引擎菜单，再把引用交给宿主聊天输入框。 */
  function handleContextRewrite(event: MouseEvent): void {
    const nodeIds = contextNodeId
      ? [contextNodeId]
      : selectedNodeIds
    requestRewrite(nodeIds)
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.closest('.context-menu')?.setAttribute('hidden', '')
  }

  /** 保存右键事件的真实节点目标，扩展菜单回调本身不包含该节点参数。 */
  function handleContextMenuShown(event: MouseEvent): void {
    const target = event.target
    const topic = target instanceof Element
      ? target.closest<HTMLElement>('.me-tpc')
      : null
    const node = topic as (HTMLElement & { nodeObj?: { id?: string } }) | null
    contextNodeId = node?.nodeObj?.id ?? ''
  }

  /** 统一承接下拉菜单的格式选择，所有格式使用同一刻的完整 mind/v1 快照。 */
  function handleDownloadAction(actionId: string): void {
    if (actionId === 'json' || actionId === 'csv' || actionId === 'xlsx' || actionId === 'xmind')
      void onexport?.(actionId, currentSnapshot())
  }

  /** 关闭查看器前先让正在编辑的 Mind Elixir 输入框失焦并进入保存队列。 */
  async function handleClose(): Promise<void> {
    if (await flushPendingChange())
      onclose?.()
  }

  // 引擎依赖 DOM 且带有全局样式，因此仅在客户端挂载后按需加载。
  onMount(() => {
    let disposed = false
    let observer: ResizeObserver | undefined
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    /** 监听宿主主题类或 data-theme 的变化。 */
    let themeObserver: MutationObserver | undefined
    /** 解绑引擎历史栈监听器，避免组件销毁后保留闭包。 */
    let unsubscribeHistory: (() => void) | undefined
    void (async () => {
      try {
        const [{ default: MindElixir }] = await Promise.all([
          import('mind-elixir'),
          import('mind-elixir/style'),
        ])
        if (disposed)
          return
        if (!canvas)
          return
        layoutSelection = data.layout
        const resolveDarkTheme = () => dark || document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark')
        themeDark = resolveDarkTheme()
        const instance = new MindElixir({
          el: canvas,
          direction: MindElixir.RIGHT,
          editable,
          allowUndo: true,
          theme: themeDark ? MindElixir.DARK_THEME : MindElixir.THEME,
          contextMenu: {
            locale: resolveContextMenuLocale(),
            extend: onrewrite
              ? [
                {
                  name: uiM('mind_context_ai_rewrite'),
                  onclick: handleContextRewrite,
                },
              ]
              : [],
          },
        })
        const initError = await instance.init(toMindElixirData(data))
        if (initError)
          throw initError
        if (disposed) {
          instance.destroy()
          return
        }
        // Expose the engine only after init installs its plugins and history stack.
        engine = instance
        lastArtifactKey = artifactKey
        lastDataSnapshot = JSON.stringify(data)
        lastEmittedSnapshot = lastDataSnapshot
        unsubscribeHistory = engine.historyStack?.subscribe(() => {
          canUndo = Boolean(engine?.historyStack?.canUndo)
          canRedo = Boolean(engine?.historyStack?.canRedo)
          // Mind Elixir records text and structural edits in its history stack before
          // notifying operation listeners, so this is the reliable persistence boundary.
          if (!suppressChange)
            emitCurrentChange('history')
        })
        canUndo = Boolean(engine.historyStack?.canUndo)
        canRedo = Boolean(engine.historyStack?.canRedo)
        engine.bus.addListener('operation', (operation) => {
          if (
            suppressChange
            || operation.silent
            || operation.name === 'beginEdit'
            || operation.name === 'expandNode'
            || operation.name === 'collapseNode'
          ) {
            return
          }
          emitCurrentChange(operation.name)
        })
        engine.bus.addListener('showContextMenu', handleContextMenuShown)
        engine.bus.addListener('selectNodes', (nodes) => {
          selectedNodeIds = [
            ...new Set(nodes.map(node => node.id)),
          ]
          const selectedNodes = selectedNodeIds
            .map(id => engine?.getObjById(id, engine.nodeData))
            .filter((node): node is NonNullable<typeof node> => Boolean(node))
          const count = selectedNodes.reduce((total, node) => total + countMindElixirNodes(node), 0)
          selectedSummary = selectedNodes.length === 1
            ? `${selectedNodes[0]!.topic} · ${count}`
            : `${selectedNodes.length} · ${count}`
          const selection: AiMindMapSelection | null = selectedNodeIds.length > 0
            ? { nodeIds: selectedNodeIds, scope: 'subtree', text: selectedSummary }
            : null
          onselectionchange?.(selection)
        })
        engine.bus.addListener('unselectNodes', () => {
          selectedNodeIds = []
          selectedSummary = ''
          onselectionchange?.(null)
        })
        observer = new ResizeObserver(() => {
          clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => engine?.scaleFit(), 100)
        })
        observer.observe(canvas)
        themeObserver = new MutationObserver(() => {
          themeDark = resolveDarkTheme()
          engine?.changeTheme(themeDark ? MindElixir.DARK_THEME : MindElixir.THEME)
        })
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'data-theme'],
        })
      }
      catch (error) {
        loadError = true
        onerror?.(error instanceof Error
          ? error
          : new Error(String(error)))
      }
    })()

    return () => {
      disposed = true
      observer?.disconnect()
      clearTimeout(resizeTimer)
      themeObserver?.disconnect()
      unsubscribeHistory?.()
      engine?.destroy()
      engine = undefined
    }
  })

  /**
   * 等待画布初始化后将数据适配层用于更新；flush 保持与宿主协议兼容。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { AiMindMapEditor } from '@h-ai/ui'
   * const editor = mount(AiMindMapEditor, { target: document.body, props: { data: { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }, artifactKey: 'mind-1' } })
   * await editor.flushPendingChange()
   * await unmount(editor)
   * ```
   */
  export function flushPendingChange(): Promise<boolean> {
    if (canvas?.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    return Promise.resolve(true)
  }

  /** 点击导出时从引擎读取同一刻的快照，避免异步保存期间混入后续编辑。 */
  function currentSnapshot(): AiMindMapData {
    return engine
      ? fromMindElixirData(engine.getData(), layoutSelection)
      : data
  }

  /**
   * 使用引擎自己的历史栈撤销最近一次编辑。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { AiMindMapEditor } from '@h-ai/ui'
   * const editor = mount(AiMindMapEditor, { target: document.body, props: { data: { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }, artifactKey: 'mind-1' } })
   * editor.undo()
   * await unmount(editor)
   * ```
   */
  export function undo(): void {
    if (editable)
      engine?.undo()
  }

  /**
   * 使用引擎自己的历史栈重做已撤销编辑。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { AiMindMapEditor } from '@h-ai/ui'
   * const editor = mount(AiMindMapEditor, { target: document.body, props: { data: { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }, artifactKey: 'mind-1' } })
   * editor.redo()
   * await unmount(editor)
   * ```
   */
  export function redo(): void {
    if (editable)
      engine?.redo()
  }

  /** 更新编辑引擎方向并将可持久化布局写入宿主草稿。 */
  function handleLayoutChange(event: Event): void {
    const target = event.currentTarget
    if (!editable || !(target instanceof HTMLSelectElement))
      return
    const nextLayout = target.value
    if (nextLayout !== 'right' && nextLayout !== 'left' && nextLayout !== 'both')
      return
    layoutSelection = nextLayout
    if (nextLayout === 'left')
      engine?.initLeft()
    else if (nextLayout === 'both')
      engine?.initSide()
    else
      engine?.initRight()
    emitCurrentChange('changeDirection')
  }

  /** 读取单个 JSON 文件后交由宿主的共享领域校验器作最终判定。 */
  async function handleImportInput(event: Event): Promise<void> {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement))
      return
    const file = input.files?.[0]
    input.value = ''
    if (!file || !onimportjson)
      return
    try {
      await onimportjson(await file.text())
    }
    catch (error) {
      onerror?.(error instanceof Error
        ? error
        : new Error(String(error)))
    }
  }

  function findNode(root: AiMindMapNode, targetId: string): AiMindMapNode | undefined {
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.id === targetId)
        return node
      stack.push(...node.children)
    }
    return undefined
  }

  function countMindElixirNodes(root: { children?: Array<{ children?: unknown[] }> }): number {
    let count = 0
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      count += 1
      stack.push(...(node.children ?? []) as typeof stack)
    }
    return count
  }

  $effect(() => {
    if (engine) {
      editable
        ? engine.enableEdit()
        : engine.disableEdit()
    }
  })

  $effect(() => {
    const nextSnapshot = JSON.stringify(data)
    if (!engine || !artifactKey)
      return
    const artifactChanged = artifactKey !== lastArtifactKey
    if (nextSnapshot === lastDataSnapshot && !artifactChanged)
      return
    suppressChange = true
    try {
      if (nextSnapshot !== lastDataSnapshot) {
        engine.diffRefresh(toMindElixirData(data))
        const direction = data.layout === 'left'
          ? 0
          : data.layout === 'both'
          ? 2
          : 1
        if (engine.direction !== direction) {
          if (data.layout === 'left')
            engine.initLeft()
          else if (data.layout === 'both')
            engine.initSide()
          else
            engine.initRight()
        }
      }
      layoutSelection = data.layout
      if (artifactChanged)
        engine.clearHistory?.()
      lastArtifactKey = artifactKey
      lastDataSnapshot = nextSnapshot
      lastEmittedSnapshot = nextSnapshot
    }
    finally {
      suppressChange = false
    }
  })
</script>

<section {...dataAttributes} class={`mind-editor ${className}`} class:dark={themeDark} aria-label={title}>
  <header class='mind-topbar'>
    <div class='mind-heading'>
      <h2 title={title}>{title}</h2>
    </div>
    {#if editable || onexport || onrewrite || onclose}
      <nav class='mind-actions' aria-label={title}>
        {#if editable}
          <button type='button' class='mind-icon-button' title={`${uiM('markdown_undo')} (Ctrl/Cmd+Z)`} aria-label={uiM('markdown_undo')} disabled={!canUndo} onclick={undo}>
            <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M10.2 6.05a7.25 7.25 0 1 1-4.82 6.83.75.75 0 0 1 1.5 0 5.75 5.75 0 1 0 3.82-5.42V10a.75.75 0 1 1-1.5 0V4a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H10.2v1.3Z'></path></svg>
          </button>
          <button type='button' class='mind-icon-button' title={`${uiM('markdown_redo')} (Ctrl/Cmd+Shift+Z)`} aria-label={uiM('markdown_redo')} disabled={!canRedo} onclick={redo}>
            <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M13.8 6.05V4.75h-5.75a.75.75 0 0 1 0-1.5h6A.75.75 0 0 1 14.8 4v6a.75.75 0 1 1-1.5 0V7.46a5.75 5.75 0 1 0 3.82 5.42.75.75 0 0 1 1.5 0 7.25 7.25 0 1 1-4.82-6.83Z'></path></svg>
          </button>
          {#if onimportjson}
            <button type='button' title={uiM('mind_import_json')} aria-label={uiM('mind_import_json')} onclick={() => importInput?.click()}>{uiM('mind_import_json')}</button>
            <input bind:this={importInput} class='mind-import-input' type='file' accept='application/json,.json' aria-label={uiM('mind_import_json')} onchange={handleImportInput} />
          {/if}
        {/if}
        {#if onrewrite}
          <button type='button' title={selectedNodeIds.length
            ? uiM('mind_rewrite_selection')
            : uiM('mind_rewrite_selection_disabled')} aria-label={uiM('mind_rewrite_selection')} disabled={selectedNodeIds.length === 0 || !editable} onclick={() => requestRewrite()}>{uiM('mind_rewrite_selection')}</button>
        {/if}
        {#if editable}
          <select aria-label={uiM('mind_layout')} title={uiM('mind_layout')} value={layoutSelection} disabled={!engine} onchange={handleLayoutChange}>
            <option value='right'>{uiM('mind_layout_right')}</option>
            <option value='left'>{uiM('mind_layout_left')}</option>
            <option value='both'>{uiM('mind_layout_both')}</option>
          </select>
        {/if}
        <button type='button' title={uiM('mind_fit')} aria-label={uiM('mind_fit')} disabled={!engine} onclick={() => engine?.scaleFit()}>{uiM('mind_fit')}</button>
        {#if saveState}
          <output class='mind-save-state' aria-live='polite'>{saveState}</output>
        {/if}
        {#if onexport}
          <AiDocumentDownloadMenu
            actions={[
              {
                id: 'json',
                label: uiM('mind_export_json'),
              },
              {
                id: 'csv',
                label: uiM('mind_export_csv'),
              },
              {
                id: 'xlsx',
                label: uiM('mind_export_xlsx'),
              },
              {
                id: 'xmind',
                label: uiM('mind_export_xmind'),
              },
            ]}
            ondownload={handleDownloadAction}
            triggerTitle={uiM('mind_download_title')}
            triggerClass='mind-toolbar-button mind-download-trigger'
            menuClass='mind-download-menu'
          />
        {/if}
        {#if onclose}
          <button type='button' class='mind-toolbar-button mind-close-button' title={uiM('markdown_close')} aria-label={uiM('markdown_close')} onclick={() => void handleClose()}>
            <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M6.97 5.91a.75.75 0 0 1 1.06 0L12 9.88l3.97-3.97a.75.75 0 1 1 1.06 1.06L13.06 10.94l3.97 3.97a.75.75 0 0 1-1.06 1.06L12 12l-3.97 3.97a.75.75 0 1 1-1.06-1.06l3.97-3.97-3.97-3.97a.75.75 0 0 1 0-1.06Z'></path></svg>
          </button>
        {/if}
      </nav>
    {/if}
  </header>
  {#if loadError}
    <div class='mind-error' role='alert'>{uiM('mind_load_error')}</div>
  {:else}
    <div bind:this={canvas} class='mind-canvas' aria-label={title || uiM('mind_default_title')}></div>
  {/if}
</section>

<style>
  .mind-editor { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 20rem; overflow: hidden; }
  .mind-topbar { display: flex; min-height: 3.5rem; align-items: center; justify-content: space-between; gap: .75rem; border-bottom: 1px solid var(--color-base-300, #d1d5db); padding: .5rem .75rem; }
  .mind-heading { min-width: 0; flex: 1; }
  .mind-heading h2 { overflow: hidden; margin: 0; color: var(--color-base-content, #111827); font-size: .95rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .mind-canvas { width: 100%; min-height: 0; flex: 1; }
  .mind-actions { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .25rem; }
  .mind-actions :global(.mind-toolbar-button), .mind-actions button, .mind-actions select { border: 1px solid var(--color-base-300, #d1d5db); border-radius: 4px; padding: .25rem .5rem; background: var(--color-base-100, #fff); color: var(--color-base-content, #111827); font-size: .75rem; }
  .mind-actions button, .mind-actions select { cursor: pointer; }
  .mind-actions button:disabled, .mind-actions select:disabled { cursor: not-allowed; opacity: .45; }
  .mind-actions :global(.mind-toolbar-button) { display: grid; width: 2rem; height: 2rem; place-items: center; padding: .35rem; cursor: pointer; }
  .mind-actions :global(.mind-download-trigger) { width: 2.5rem; height: 2.5rem; min-height: 2.5rem; border-radius: 1rem; padding: 0; }
  .mind-actions :global(.mind-toolbar-button svg) { width: 1.1rem; height: 1.1rem; fill: currentColor; }
  .mind-actions :global(.mind-download-menu) { top: calc(100% + .8rem); right: 0; }
  .mind-close-button { color: var(--color-base-content, #111827); }
  .mind-save-state { align-self: center; padding-inline: .25rem; color: var(--color-base-content, #111827); font-size: .75rem; }
  .mind-icon-button svg { width: 1.25rem; height: 1.25rem; fill: currentColor; }
  .mind-import-input { display: none; }
  .mind-error { padding: 1rem; color: var(--color-error, #b42318); }
  .dark { color-scheme: dark; }
  @media (max-width: 48rem) {
    .mind-topbar { align-items: flex-start; flex-direction: column; }
    .mind-actions { width: 100%; justify-content: flex-start; }
  }
</style>
