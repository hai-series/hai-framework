<!--
  =============================================================================
  @h-ai/ui - AiDocumentEditor 组件
  =============================================================================
  通用 Markdown 渲染器，支持两种模式：
  - document：带目录、工具栏、代码运行预览的文档面板
  - code: 仅渲染代码块，适用于 AI 代码产物的展示和交互。

  适用于 AI 输出显示、文档预览、代码说明面板等场景。
  使用 Svelte 5 Runes ($props, $state, $derived, $effect)
  =============================================================================
-->
<script lang='ts'>
  import type {
    AiDocumentEditorProps,
    MarkdownBlockFormatKind,
    MarkdownCodeBlockItem,
    MarkdownCodeRunRequest,
    MarkdownCodeRunResult,
    MarkdownInlineFormatKind,
    MarkdownRewriteAction,
    MarkdownToolbarDownloadAction,
  } from './document-types.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import { renderMarkdownDocument } from './document-parse.js'
  import { parseMarkdown } from './markdown-parse.js'

  interface SelectionToolbarPosition {
    /** 选区工具条相对滚动容器的 top 坐标。 */
    top: number
    /** 选区工具条中心点相对滚动容器的 left 坐标。 */
    left: number
  }

  interface CodePreviewState {
    /** 当前代码块预览所处的生命周期阶段。 */
    status: 'running' | 'ready' | 'error'
    /** 运行成功后用于渲染预览区的结构化结果。 */
    result?: MarkdownCodeRunResult
    /** 运行失败时展示在预览区的错误摘要。 */
    error?: string
  }

  // 复制前后的图标以内联 SVG 缓存，避免每次点击都重新拼接按钮内容。
  const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

  let {
    // 暴露给外层的滚动容器引用，用于同步滚动或定位选区工具条。
    editorScrollHost = $bindable<HTMLDivElement | null>(null),
    // 暴露给外层的正文容器引用，contenteditable 时用于读取 DOM。
    previewHost = $bindable<HTMLElement | null>(null),
    // 文档原始 Markdown 内容。
    content = '',
    // 文档标题展示文案。
    title = '',
    // 内容来源类型，决定 document/code 渲染分支。
    sourceKind = 'markdown',
    // sourceKind=code 时的默认语言提示。
    codeLanguage,
    // 外层自定义类名。
    class: className = '',
    // 是否显示代码块复制按钮。
    showCopyButton = true,
    // 是否显示代码块运行按钮与预览占位。
    showRunButton = false,
    // 是否启用语法高亮。
    enableHighlight = true,
    // 是否把换行渲染为 <br>。
    breaks = true,
    // 是否显示左侧目录。
    showOutline = true,
    // 是否显示顶部工具栏。
    showToolbar = true,
    // 目录面板初始是否折叠。
    initialOutlineCollapsed = false,
    // 主状态文案（保存状态等）。
    statusText = '',
    // 标题上方的主状态文案，优先级高于 statusText。
    metaText = '',
    // 标题区胶囊状态文案。
    saveState = '',
    // 眉标题文案，默认使用 i18n 文案。
    eyebrow = uiM('markdown_document_eyebrow'),
    // 是否处于改写中状态。
    rewritePending = false,
    // 改写动作列表。
    rewriteActions = [],
    // 是否启用正文编辑能力。
    editable = false,
    // 顶部下载菜单动作列表。
    downloadActions = [],
    // “历史版本”按钮文案。
    historyActionLabel = uiM('markdown_history'),
    // “查看版本”按钮文案。
    versionActionLabel = uiM('markdown_view_version'),
    // 关闭回调。
    onclose,
    // 撤销回调。
    onundo,
    // 重做回调。
    onredo,
    // 代码运行回调。
    oncoderun,
    // 选区改写回调。
    onrewrite,
    // 文档滚动回调。
    ondocumentscroll,
    // 选区 mouseup 回调。
    onpreviewmouseup,
    // 编辑输入回调。
    onpreviewinput,
    // 编辑失焦回调。
    onpreviewblur,
    // 下载动作回调。
    ondownload,
    // 历史版本入口回调。
    onhistory,
    // 全文复制回调。
    oncopydocument,
    // 块级格式动作回调。
    onapplyblockformat,
    // 行内格式动作回调。
    onapplyinlineformat,
    // 选区复制回调。
    oncopyselection,
    // 选区注释回调。
    onannotation,
  }: AiDocumentEditorProps = $props()

  // downloadMenuWrapEl 只负责判断 pointerdown 是否落在下载菜单区域内。
  let downloadMenuWrapEl: HTMLDivElement | undefined = $state()
  // outlineCollapsedInitialized 用来把 `initialOutlineCollapsed` 只消费一次，避免用户手动展开后又被 props 回写覆盖。
  let outlineCollapsedInitialized = $state(false)
  // 当前目录是否折叠。
  let outlineCollapsed = $state(false)
  // 当前滚动视口对应的高亮标题 id。
  let activeHeadingId = $state('')
  // 当前选中的纯文本，会原样传给 AI 改写动作。
  let selectedText = $state('')
  // 选区工具条显示开关。
  let selectionToolbarVisible = $state(false)
  // 改写菜单显示开关。
  let rewriteMenuOpen = $state(false)
  // 选区工具条在滚动容器中的定位坐标。
  let toolbarPosition = $state<SelectionToolbarPosition>({ top: 0, left: 0 })
  // 下载菜单展开态由组件内部维护，避免外层只是展示文档时还要持有这部分 UI 状态。
  let downloadMenuOpen = $state(false)
  // 每个代码块的运行状态和预览结果，key 为 codeBlockId。
  let codePreviews = $state<Record<string, CodePreviewState>>({})

  // code 类型产物通常只有裸代码文本，这里统一包成 fenced block 进入同一条渲染链路。
  const documentContent = $derived(
    resolveDocumentContent(content, sourceKind, codeLanguage),
  )
  // 渲染结果同时提供 HTML、目录和代码块元数据，供顶部目录与代码预览共用。
  const renderResult = $derived(
    renderMarkdownDocument(documentContent, {
      enableHighlight,
      showCopyButton,
      showRunButton,
      breaks,
    }),
  )
  // html 是最终注入正文的内容。
  const html = $derived(renderResult.html)
  // outline 是左侧目录的原始数据源。
  const outline = $derived(renderResult.outline)
  // outlineHasContent 用来区分“目录被收起”和“正文确实没有标题”。
  const outlineHasContent = $derived(outline.length > 0)
  // 只有在外层真正接入下载能力时，才展示下载菜单。
  const resolvedDownloadActions = $derived(
    resolveDownloadActions(downloadActions, ondownload),
  )
  // 未显式传入动作时，按内置动作列表补齐 AI 改写菜单。
  const resolvedRewriteActions = $derived(
    resolveRewriteActions(rewriteActions, onrewrite),
  )
  // selectionToolsEnabled 统一判断选区工具条是否值得出现，避免正文只读展示时还露出空浮层。
  const selectionToolsEnabled = $derived(
    [
      onrewrite,
      onapplyblockformat,
      onapplyinlineformat,
      oncopyselection,
      onannotation,
    ].some(Boolean),
  )
  // 顶部第一行主状态优先展示“正在改写”；普通展示场景只在存在 saveState 或 metaText 时补充状态，避免和标题区胶囊重复。
  const headerPrimaryText = $derived(
    rewritePending
      ? uiM('markdown_rewriting')
      : metaText || (saveState ? statusText : ''),
  )
  // 标题区胶囊优先展示 saveState，没有时退回状态文案，方便 ChatWorkspace 只传 statusText 也能显示。
  const heroStatusText = $derived(saveState || statusText)
  // readerDocumentClass 只负责正文文章区域，不和外层容器类名混用。
  const readerDocumentClass = $derived(
    cn(
      'hai-markdown',
      'hai-markdown-document',
      editable ? 'hai-markdown-editable' : '',
    ),
  )

  $effect(() => {
    void html
    if (typeof window === 'undefined' || !previewHost) {
      return
    }

    requestAnimationFrame(() => {
      syncCodePreviewHosts()
      syncActiveHeadingFromScroll()
    })
  })

  $effect(() => {
    void codePreviews
    if (typeof window === 'undefined' || !previewHost) {
      return
    }

    requestAnimationFrame(() => {
      syncCodePreviewHosts()
    })
  })

  $effect(() => {
    void outline
    if (!outlineHasContent) {
      activeHeadingId = ''
      return
    }

    if (
      !activeHeadingId
      || !outline.some(item => item.id === activeHeadingId)
    ) {
      activeHeadingId = outline[0]?.id ?? ''
    }
  })

  $effect(() => {
    void documentContent
    closeSelectionToolbar()
  })

  $effect(() => {
    if (outlineCollapsedInitialized) {
      return
    }

    outlineCollapsed = initialOutlineCollapsed
    outlineCollapsedInitialized = true
  })

  $effect(() => {
    if (!downloadMenuOpen || typeof window === 'undefined') {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || downloadMenuWrapEl?.contains(target)) {
        return
      }
      downloadMenuOpen = false
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  })

  /**
   * code 类型产物在上游通常只有裸代码文本。
   * 这里统一包成 fenced code block，确保高亮、复制和运行入口全部复用同一条渲染链路。
   */
  function resolveDocumentContent(
    value: string,
    kind: AiDocumentEditorProps['sourceKind'],
    language?: string,
  ): string {
    if (kind !== 'code') {
      return value
    }

    // fenceLength 需要避开正文里已有的反引号长度，防止包裹后的 fenced block 提前闭合。
    const fenceLength = Math.max(
      3,
      ...Array.from(value.matchAll(/`{3,}/g), match => match[0].length + 1),
    )
    const fence = '`'.repeat(fenceLength)
    const normalizedLanguage = language?.trim() ?? ''
    const suffix = value.endsWith('\n') ? '' : '\n'
    return `${fence}${normalizedLanguage}\n${value}${suffix}${fence}`
  }

  function resolveDownloadActions(
    actions: MarkdownToolbarDownloadAction[],
    handler?: AiDocumentEditorProps['ondownload'],
  ): MarkdownToolbarDownloadAction[] {
    if (actions.length > 0) {
      return actions
    }

    if (!handler) {
      return []
    }

    return [
      { id: 'markdown', label: uiM('markdown_download_markdown') },
      { id: 'word', label: uiM('markdown_download_word') },
      { id: 'pdf', label: uiM('markdown_download_pdf') },
    ]
  }

  function resolveRewriteActions(
    actions: MarkdownRewriteAction[],
    handler?: AiDocumentEditorProps['onrewrite'],
  ): MarkdownRewriteAction[] {
    if (actions.length > 0) {
      return actions
    }

    if (!handler) {
      return []
    }

    return [
      { id: 'polish', label: uiM('markdown_rewrite_polish') },
      { id: 'expand', label: uiM('markdown_rewrite_expand') },
      { id: 'shorten', label: uiM('markdown_rewrite_shorten') },
      { id: 'explain', label: uiM('markdown_rewrite_explain') },
    ]
  }

  async function copyRawContent(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content)
    }
    catch {
    // clipboard API 可能被安全策略禁用；保持静默避免打断阅读。
    }
  }

  async function handleCopyDocument(): Promise<void> {
    if (oncopydocument) {
      await oncopydocument()
      return
    }

    await copyRawContent()
  }

  function updateCopyButtonState(button: HTMLButtonElement): void {
    button.classList.add('hai-md-copied')
    button.innerHTML = CHECK_ICON

    window.setTimeout(() => {
      button.classList.remove('hai-md-copied')
      button.innerHTML = COPY_ICON
    }, 2000)
  }

  async function copyCodeFromButton(button: HTMLButtonElement): Promise<void> {
    const codeBlock = button.closest('.hai-md-code-block')
    const codeEl = codeBlock?.querySelector('code')
    if (!codeEl) {
      return
    }

    try {
      await navigator.clipboard.writeText(codeEl.textContent ?? '')
      updateCopyButtonState(button)
    }
    catch {
    // clipboard API 可能被安全策略禁用；不抛错以免阻断其他交互。
    }
  }

  function lookupCodeBlock(blockId: string): MarkdownCodeBlockItem | undefined {
    return renderResult.codeBlocks.find(item => item.id === blockId)
  }

  function looksLikeHtml(code: string): boolean {
    return /<!doctype html>|<html[\s>]|<body[\s>]|<div[\s>]|<main[\s>]/i.test(
      code,
    )
  }

  function buildJavaScriptPreview(code: string): string {
    const safeCode = code.replace(/<\/script/gi, '<\\/script')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 16px;
        font: 14px/1.6 system-ui, sans-serif;
        color: #1f2937;
        background: #f8fafc;
      }

      #app {
        min-height: 48px;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
${safeCode}
    <\/script>
  </body>
</html>`
  }

  function buildCssPreview(code: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${code}</style>
    <style>
      body {
        margin: 0;
        padding: 20px;
        font: 14px/1.6 system-ui, sans-serif;
        background: #f8fafc;
      }

      .preview-card {
        border-radius: 16px;
        padding: 24px;
        border: 1px dashed #cbd5e1;
        background: white;
      }
    </style>
  </head>
  <body>
    <div class="preview-card">
      <h3>CSS Preview</h3>
      <p>This surface is provided so the stylesheet can render immediately.</p>
      <button type="button">Action</button>
    </div>
  </body>
</html>`
  }

  /**
   * 没有外部运行器时，组件只为可直接在浏览器里安全预览的语言提供兜底能力。
   * 其余语言返回 undefined，让上层明确知道需要后端或沙箱参与执行。
   */
  function createBuiltInCodePreview(
    request: MarkdownCodeRunRequest,
  ): MarkdownCodeRunResult | undefined {
    const language = request.language?.trim().toLocaleLowerCase()

    if (
      language === 'html'
      || language === 'htm'
      || language === 'xml'
      || language === 'svg'
      || (!language && looksLikeHtml(request.code))
    ) {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: request.code,
      }
    }

    if (language === 'javascript' || language === 'js' || language === 'mjs') {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: buildJavaScriptPreview(request.code),
      }
    }

    if (language === 'css') {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: buildCssPreview(request.code),
      }
    }

    if (language === 'markdown' || language === 'md') {
      return {
        kind: 'markdown',
        title: uiM('markdown_run_preview'),
        content: request.code,
      }
    }

    return undefined
  }

  async function runCodeBlock(blockId: string): Promise<void> {
    const codeBlock = lookupCodeBlock(blockId)
    if (!codeBlock) {
      return
    }

    codePreviews = {
      ...codePreviews,
      [blockId]: {
        status: 'running',
      },
    }

    const request: MarkdownCodeRunRequest = {
      blockId,
      code: codeBlock.code,
      language: codeBlock.language,
      title: title || undefined,
      sourceKind,
    }

    try {
      const preview = await (oncoderun?.(request)
        ?? createBuiltInCodePreview(request))

      if (!preview) {
        codePreviews = {
          ...codePreviews,
          [blockId]: {
            status: 'error',
            error: uiM('markdown_run_unavailable'),
          },
        }
        return
      }

      codePreviews = {
        ...codePreviews,
        [blockId]: {
          status: 'ready',
          result: preview,
        },
      }
    }
    catch (error) {
      codePreviews = {
        ...codePreviews,
        [blockId]: {
          status: 'error',
          error:
            error instanceof Error ? error.message : uiM('markdown_run_failed'),
        },
      }
    }
  }

  async function handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement
    const copyButton = target.closest(
      '[data-copy-code]',
    ) as HTMLButtonElement | null
    if (copyButton) {
      await copyCodeFromButton(copyButton)
      return
    }

    const runButton = target.closest(
      '[data-run-code]',
    ) as HTMLButtonElement | null
    const codeBlockId = runButton?.dataset.codeBlockId
    if (runButton && codeBlockId) {
      await runCodeBlock(codeBlockId)
    }
  }

  /**
   * 代码预览宿主位于 `{@html}` 注入的 DOM 内部，无法直接用 Svelte 子组件管理。
   * 这里统一在 effect 中把运行结果写回这些占位节点，兼顾运行中、成功和失败三种状态。
   */
  function syncCodePreviewHosts(): void {
    if (!previewHost) {
      return
    }

    const hosts = previewHost.querySelectorAll<HTMLElement>(
      '[data-code-preview-host]',
    )
    for (const host of hosts) {
      const blockId = host.dataset.codePreviewHost
      if (!blockId) {
        continue
      }

      renderCodePreviewHost(host, codePreviews[blockId])
    }
  }

  function renderCodePreviewHost(
    host: HTMLElement,
    preview: CodePreviewState | undefined,
  ): void {
    if (!preview) {
      host.innerHTML = ''
      return
    }

    if (preview.status === 'running') {
      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${escapePreviewText(uiM('markdown_running'))}</div><div class="hai-md-preview-loading"></div></div>`
      return
    }

    if (preview.status === 'error') {
      host.innerHTML = `<div class="hai-md-preview-card hai-md-preview-error"><div class="hai-md-preview-head">${escapePreviewText(uiM('markdown_run_failed'))}</div><pre>${escapePreviewText(preview.error ?? uiM('markdown_run_failed'))}</pre></div>`
      return
    }

    const result = preview.result
    if (!result) {
      host.innerHTML = ''
      return
    }

    const previewTitle = escapePreviewText(
      result.title ?? uiM('markdown_run_preview'),
    )
    const previewDesc = result.description
      ? `<p class="hai-md-preview-desc">${escapePreviewText(result.description)}</p>`
      : ''

    if (result.kind === 'html') {
      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<iframe class="hai-md-preview-frame" sandbox="allow-scripts" srcdoc="${escapePreviewAttribute(result.content)}" title="${previewTitle}"></iframe></div>`
      return
    }

    if (result.kind === 'markdown') {
      const markdownHtml = parseMarkdown(result.content, {
        enableHighlight,
        showCopyButton: false,
        showRunButton: false,
        breaks,
      })

      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<div class="hai-md-preview-rendered">${markdownHtml}</div></div>`
      return
    }

    host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<pre>${escapePreviewText(result.content)}</pre></div>`
  }

  function escapePreviewText(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function escapePreviewAttribute(value: string): string {
    return escapePreviewText(value).replace(/\n/g, '&#10;')
  }

  function closeSelectionToolbar(): void {
    selectionToolbarVisible = false
    rewriteMenuOpen = false
    selectedText = ''
  }

  /**
   * 目录高亮不依赖 IntersectionObserver，而是按滚动容器内标题的相对位置推断。
   * 这样正文持续流式刷新时不需要反复重建 observer，也更容易和目录点击滚动保持一致。
   */
  function syncActiveHeadingFromScroll(): void {
    if (!editorScrollHost || !previewHost || !outlineHasContent) {
      return
    }

    const headings = [
      ...previewHost.querySelectorAll<HTMLElement>('[data-heading-id]'),
    ]
    if (headings.length === 0) {
      return
    }

    const hostRect = editorScrollHost.getBoundingClientRect()
    let nextActiveId = headings[0]?.dataset.headingId ?? ''

    for (const heading of headings) {
      const headingId = heading.dataset.headingId
      if (!headingId) {
        continue
      }

      const top = heading.getBoundingClientRect().top - hostRect.top
      if (top <= 72) {
        nextActiveId = headingId
      }
      else {
        break
      }
    }

    activeHeadingId = nextActiveId
  }

  function handleDocumentScroll(event: Event): void {
    syncActiveHeadingFromScroll()
    if (selectionToolbarVisible) {
      closeSelectionToolbar()
    }
    ondocumentscroll?.(event)
  }

  function scrollToHeading(id: string): void {
    if (!editorScrollHost || !previewHost) {
      return
    }

    const target = previewHost.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!target) {
      return
    }

    activeHeadingId = id
    const offsetTop = Math.max(0, target.offsetTop - 16)
    editorScrollHost.scrollTo({ top: offsetTop, behavior: 'smooth' })
  }

  /**
   * 选区工具条依赖真实 DOM 选区范围，因此只在 selection 落在当前正文容器内时显示。
   * 一旦内容刷新或滚动位置变化，就主动关闭，避免把旧选区动作误用到新内容上。
   */
  function handleSelectionChange(): void {
    if (
      !selectionToolsEnabled
      || typeof window === 'undefined'
      || !previewHost
      || !editorScrollHost
    ) {
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      closeSelectionToolbar()
      return
    }

    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (
      !anchorNode
      || !focusNode
      || !previewHost.contains(anchorNode)
      || !previewHost.contains(focusNode)
    ) {
      closeSelectionToolbar()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      closeSelectionToolbar()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const hostRect = editorScrollHost.getBoundingClientRect()
    const center = rect.left - hostRect.left + rect.width / 2

    selectedText = text
    selectionToolbarVisible = true
    rewriteMenuOpen = false
    toolbarPosition = {
      top: Math.max(
        12,
        editorScrollHost.scrollTop + rect.top - hostRect.top - 56,
      ),
      left: Math.max(140, Math.min(editorScrollHost.clientWidth - 140, center)),
    }
  }

  async function applyRewrite(actionId: string): Promise<void> {
    if (!onrewrite || !selectedText.trim()) {
      return
    }

    rewriteMenuOpen = false
    await onrewrite({
      actionId,
      selectedText,
      content,
      title: title || undefined,
    })
  }

  function applyBlockFormat(kind: MarkdownBlockFormatKind): void {
    onapplyblockformat?.(kind)
    closeSelectionToolbar()
  }

  function applyInlineFormat(kind: MarkdownInlineFormatKind): void {
    onapplyinlineformat?.(kind)
    closeSelectionToolbar()
  }

  async function copySelection(): Promise<void> {
    await oncopyselection?.()
    closeSelectionToolbar()
  }

  async function annotateSelection(): Promise<void> {
    await onannotation?.()
    closeSelectionToolbar()
  }

  function handlePreviewMouseUp(): void {
    handleSelectionChange()
    onpreviewmouseup?.()
  }

  function handlePreviewInput(event: Event): void {
    onpreviewinput?.(event)
  }

  function handlePreviewBlur(): void {
    closeSelectionToolbar()
    onpreviewblur?.()
  }

  function handleDownloadAction(actionId: string): void {
    downloadMenuOpen = false
    ondownload?.(actionId)
  }
</script>

<section class={cn('hai-ai-doc-pane', className)}>
  <div class='hai-ai-doc-shell'>
    {#if showToolbar}
      <header class='hai-ai-doc-topbar'>
        <div class='hai-ai-doc-meta-bar'>
          <div class='hai-ai-doc-meta'>
            {#if headerPrimaryText}
              <span class='hai-ai-doc-status'>{headerPrimaryText}</span>
            {/if}

            {#if saveState}
              <span class='hai-ai-doc-status hai-ai-doc-status-subtle'
              >{saveState}</span
              >
            {/if}
          </div>

          <div class='hai-ai-doc-toolbar'>
            {#if onundo}
              <button
                type='button'
                class='hai-ai-doc-toolbar-ghost'
                aria-label={uiM('markdown_undo')}
                onclick={onundo}
              >
                ↶
              </button>
            {/if}

            {#if onredo}
              <button
                type='button'
                class='hai-ai-doc-toolbar-ghost'
                aria-label={uiM('markdown_redo')}
                onclick={onredo}
              >
                ↷
              </button>
            {/if}

            {#if onundo || onredo}
              <span class='hai-ai-doc-toolbar-divider'></span>
            {/if}

            <button
              type='button'
              class='hai-ai-doc-toolbar-action'
              onclick={handleCopyDocument}
            >
              {uiM('markdown_copy_document')}
            </button>

            {#if resolvedDownloadActions.length > 0}
              <div
                bind:this={downloadMenuWrapEl}
                class='hai-ai-doc-download-wrap'
              >
                <button
                  type='button'
                  class='hai-ai-doc-toolbar-action'
                  onclick={() => (downloadMenuOpen = !downloadMenuOpen)}
                >
                  {uiM('markdown_download')}
                </button>

                {#if downloadMenuOpen}
                  <div class='hai-ai-doc-download-menu'>
                    {#each resolvedDownloadActions as action}
                      <button
                        type='button'
                        class='hai-ai-doc-download-item'
                        onclick={() => handleDownloadAction(action.id)}
                      >
                        {action.label}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            {#if onhistory}
              <button
                type='button'
                class='hai-ai-doc-toolbar-action'
                onclick={onhistory}
              >
                {historyActionLabel}
              </button>
            {/if}

            {#if onclose}
              <button
                type='button'
                class='hai-ai-doc-toolbar-close'
                aria-label={uiM('markdown_close')}
                onclick={onclose}
              >
                ×
              </button>
            {/if}
          </div>
        </div>
      </header>
    {/if}

    <div class='hai-ai-doc-heading-row'>
      <div class='hai-ai-doc-title-block'>
        {#if eyebrow}
          <p class='hai-ai-doc-eyebrow'>{eyebrow}</p>
        {/if}

        {#if title}
          <h2>{title}</h2>
        {/if}
      </div>

      {#if heroStatusText || onhistory}
        <div class='hai-ai-doc-heading-actions'>
          {#if heroStatusText}
            <span class='hai-ai-doc-save-pill'>{heroStatusText}</span>
          {/if}

          {#if onhistory}
            <button
              type='button'
              class='hai-ai-doc-version-toggle'
              onclick={onhistory}
            >
              {versionActionLabel}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div
      class:hai-ai-doc-layout-collapsed={outlineCollapsed}
      class='hai-ai-doc-layout'
    >
      {#if showOutline && !outlineCollapsed}
        <aside class='hai-ai-doc-outline'>
          <div class='hai-ai-doc-outline-head'>
            <strong>{uiM('markdown_outline')}</strong>

            <button
              type='button'
              class='hai-ai-doc-outline-toggle'
              onclick={() => (outlineCollapsed = true)}
            >
              {uiM('markdown_hide_outline')}
            </button>
          </div>

          {#if outlineHasContent}
            <nav class='hai-ai-doc-outline-list'>
              {#each outline as item}
                <button
                  type='button'
                  class:active={activeHeadingId === item.id}
                  class='hai-ai-doc-outline-item'
                  style={`padding-left:${0.65 + (item.level - 1) * 0.56}rem`}
                  onclick={() => scrollToHeading(item.id)}
                >
                  {item.numberedTitle}
                </button>
              {/each}
            </nav>
          {:else}
            <p class='hai-ai-doc-outline-empty'>{uiM('markdown_no_outline')}</p>
          {/if}
        </aside>
      {/if}

      <section class='hai-ai-doc-reader'>
        {#if showOutline && outlineCollapsed}
          <button
            type='button'
            class='hai-ai-doc-outline-open'
            onclick={() => (outlineCollapsed = false)}
          >
            {uiM('markdown_show_outline')}
          </button>
        {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={editorScrollHost}
          class='hai-ai-doc-scroll'
          onclick={handleClick}
          onscroll={handleDocumentScroll}
          onkeyup={handleSelectionChange}
          onfocusout={() => {
            if (typeof window !== 'undefined') {
              window.setTimeout(() => {
                handleSelectionChange()
              }, 0)
            }
          }}
        >
          {#if selectionToolbarVisible}
            <div
              class='hai-ai-doc-selection-layer'
              style={`top:${toolbarPosition.top}px; left:${toolbarPosition.left}px;`}
            >
              <div
                class='hai-ai-doc-selection-toolbar'
                role='toolbar'
                tabindex='-1'
                onmousedown={event => event.preventDefault()}
              >
                {#if onrewrite}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-chip'
                    disabled={rewritePending}
                    onclick={() => (rewriteMenuOpen = !rewriteMenuOpen)}
                  >
                    {uiM('markdown_rewrite')}
                  </button>
                {/if}

                {#if onapplyblockformat}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_heading')}
                    onclick={() => applyBlockFormat('heading')}
                  >
                    T
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_bullet')}
                    onclick={() => applyBlockFormat('bullet')}
                  >
                    {uiM('markdown_format_bullet')}
                  </button>
                {/if}

                {#if onapplyinlineformat}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_bold')}
                    onclick={() => applyInlineFormat('bold')}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_strike')}
                    onclick={() => applyInlineFormat('strike')}
                  >
                    S
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_italic')}
                    onclick={() => applyInlineFormat('italic')}
                  >
                    <em>I</em>
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_underline')}
                    onclick={() => applyInlineFormat('underline')}
                  >
                    U
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_link')}
                    onclick={() => applyInlineFormat('link')}
                  >
                    {uiM('markdown_format_link')}
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_code')}
                    onclick={() => applyInlineFormat('code')}
                  >
                    &lt;/&gt;
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_highlight')}
                    onclick={() => applyInlineFormat('highlight')}
                  >
                    A
                  </button>
                {/if}

                {#if oncopyselection}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn hai-ai-doc-selection-btn-wide'
                    onclick={copySelection}
                  >
                    {uiM('markdown_copy_selection')}
                  </button>
                {/if}

                {#if onannotation}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn hai-ai-doc-selection-btn-wide'
                    onclick={annotateSelection}
                  >
                    {uiM('markdown_annotation')}
                  </button>
                {/if}
              </div>

              {#if rewriteMenuOpen}
                <div
                  class='hai-ai-doc-rewrite-menu'
                  role='menu'
                  tabindex='-1'
                  onmousedown={event => event.preventDefault()}
                >
                  {#each resolvedRewriteActions as action}
                    <button
                      type='button'
                      disabled={rewritePending}
                      onclick={() => applyRewrite(action.id)}
                    >
                      {action.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <article
            bind:this={previewHost}
            class={readerDocumentClass}
            contenteditable={editable}
            role='document'
            onmouseup={handlePreviewMouseUp}
            oninput={handlePreviewInput}
            onblur={handlePreviewBlur}
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown HTML 渲染 -->
            {@html html}
          </article>
        </div>
      </section>
    </div>
  </div>
</section>

<style>
  .hai-ai-doc-pane {
    display: flex;
    min-height: 0;
    height: 100%;
    flex-direction: column;
    border: 1px solid oklch(var(--bc) / 0.08);
    border-radius: 1.5rem;
    background: linear-gradient(
      180deg,
      oklch(var(--b1)) 0%,
      oklch(var(--b1) / 0.98) 100%
    );
    overflow: hidden;
    box-shadow: 0 14px 40px oklch(var(--bc) / 0.06);
  }

  .hai-ai-doc-shell {
    display: grid;
    grid-template-rows: auto auto 1fr;
    min-height: 0;
    height: 100%;
  }

  .hai-ai-doc-topbar {
    padding: 1rem 1.5rem 0.5rem;
  }

  .hai-ai-doc-meta-bar,
  .hai-ai-doc-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .hai-ai-doc-meta-bar {
    padding: 0.75rem 0;
    border-bottom: 1px solid oklch(var(--bc) / 0.08);
  }

  .hai-ai-doc-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    color: oklch(var(--bc) / 0.68);
    font-size: 0.95rem;
  }

  .hai-ai-doc-status {
    min-width: 0;
    white-space: nowrap;
  }

  .hai-ai-doc-status-subtle {
    color: oklch(var(--bc) / 0.52);
  }

  .hai-ai-doc-toolbar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .hai-ai-doc-toolbar-ghost,
  .hai-ai-doc-toolbar-action {
    color: oklch(var(--bc));
  }

  .hai-ai-doc-toolbar-ghost {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    background: oklch(var(--b1));
    border: 1px solid oklch(var(--bc) / 0.08);
    transition: all 0.15s ease;
  }

  .hai-ai-doc-toolbar-ghost:hover,
  .hai-ai-doc-toolbar-action:hover,
  .hai-ai-doc-version-toggle:hover,
  .hai-ai-doc-outline-open:hover {
    border-color: oklch(var(--bc) / 0.12);
    background: oklch(var(--bc) / 0.04);
  }

  .hai-ai-doc-toolbar-ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .hai-ai-doc-toolbar-action,
  .hai-ai-doc-version-toggle {
    border: 1px solid transparent;
    border-radius: 9999px;
    padding: 0.55rem 0.85rem;
    background: transparent;
    transition: all 0.15s ease;
  }

  .hai-ai-doc-download-wrap {
    position: relative;
  }

  .hai-ai-doc-download-menu {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 30;
    min-width: 10.5rem;
    display: grid;
    gap: 0.125rem;
    padding: 0.4rem;
    border: 1px solid oklch(var(--bc) / 0.12);
    border-radius: 0.95rem;
    background: oklch(var(--b1));
    box-shadow: 0 18px 36px oklch(var(--bc) / 0.12);
  }

  .hai-ai-doc-download-item {
    text-align: left;
    border: none;
    border-radius: 0.75rem;
    padding: 0.55rem 0.75rem;
    color: inherit;
    background: transparent;
  }

  .hai-ai-doc-download-item:hover {
    background: oklch(var(--bc) / 0.05);
  }

  .hai-ai-doc-toolbar-close {
    width: 2.45rem;
    height: 2.45rem;
    border-radius: 0.95rem;
    display: grid;
    place-items: center;
    background: oklch(var(--b1));
    border: 1px solid oklch(var(--bc) / 0.1);
    color: inherit;
    font-size: 1.35rem;
    line-height: 1;
  }

  .hai-ai-doc-toolbar-divider {
    width: 1px;
    height: 1.35rem;
    background: oklch(var(--bc) / 0.12);
  }

  .hai-ai-doc-heading-row {
    padding: 0.75rem 1.5rem 1rem;
  }

  .hai-ai-doc-title-block h2 {
    margin: 0;
    font-size: 1.4rem;
    line-height: 1.25;
  }

  .hai-ai-doc-eyebrow {
    margin: 0 0 0.35rem;
    color: oklch(var(--bc) / 0.72);
    font-size: 0.92rem;
    font-weight: 700;
  }

  .hai-ai-doc-heading-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .hai-ai-doc-save-pill {
    display: inline-flex;
    align-items: center;
    min-height: 2.35rem;
    padding: 0 1rem;
    border-radius: 9999px;
    background: color-mix(in srgb, #fef0c8 82%, white 18%);
    color: #8a621b;
    font-weight: 700;
  }

  .hai-ai-doc-version-toggle {
    background: color-mix(in srgb, oklch(var(--b2)) 82%, white 18%);
  }

  .hai-ai-doc-layout {
    min-height: 0;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    position: relative;
    overflow: hidden;
  }

  .hai-ai-doc-layout.hai-ai-doc-layout-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .hai-ai-doc-outline {
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    padding: 0.5rem 0.625rem 1.25rem 1rem;
    border-right: 1px solid oklch(var(--bc) / 0.08);
    background: linear-gradient(
      180deg,
      oklch(var(--b2) / 0.42),
      transparent 100%
    );
  }

  .hai-ai-doc-outline-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.375rem 0.875rem 0;
  }

  .hai-ai-doc-outline-head strong {
    font-size: 0.94rem;
    color: oklch(var(--bc) / 0.84);
  }

  .hai-ai-doc-outline-toggle,
  .hai-ai-doc-outline-open {
    border: 1px solid transparent;
    color: oklch(var(--bc) / 0.74);
    background: transparent;
    font-size: 0.875rem;
  }

  .hai-ai-doc-outline-open {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    border-radius: 9999px;
    padding: 0.55rem 0.85rem;
    background: oklch(var(--b1) / 0.94);
    border-color: oklch(var(--bc) / 0.08);
    box-shadow: 0 10px 26px oklch(var(--bc) / 0.08);
  }

  .hai-ai-doc-outline-list {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .hai-ai-doc-outline-item {
    width: 100%;
    text-align: left;
    color: oklch(var(--bc) / 0.68);
    line-height: 1.5;
    padding-top: 0.3rem;
    padding-right: 0.25rem;
    padding-bottom: 0.3rem;
    border: none;
    border-radius: 0.75rem;
    background: transparent;
    transition: all 0.15s ease;
  }

  .hai-ai-doc-outline-item:hover {
    background: oklch(var(--bc) / 0.05);
    color: inherit;
  }

  .hai-ai-doc-outline-item.active {
    color: oklch(var(--p));
    font-weight: 700;
    background: oklch(var(--p) / 0.12);
  }

  .hai-ai-doc-outline-empty {
    margin: 0;
    padding: 0.25rem 0.25rem 0;
    color: oklch(var(--bc) / 0.58);
    font-size: 0.875rem;
  }

  .hai-ai-doc-reader {
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  .hai-ai-doc-scroll {
    position: relative;
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0 1.75rem;
  }

  .hai-ai-doc-selection-layer {
    position: absolute;
    z-index: 20;
    display: grid;
    gap: 0.375rem;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .hai-ai-doc-selection-toolbar {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    max-width: min(calc(100vw - 2rem), 34rem);
    padding: 0.375rem;
    border-radius: 1.125rem;
    background: oklch(var(--b1) / 0.98);
    border: 1px solid oklch(var(--bc) / 0.08);
    box-shadow: 0 10px 26px oklch(var(--bc) / 0.16);
    pointer-events: auto;
  }

  .hai-ai-doc-selection-chip,
  .hai-ai-doc-selection-btn {
    border: none;
    border-radius: 9999px;
    min-height: 2.3rem;
  }

  .hai-ai-doc-selection-chip {
    padding: 0 0.875rem;
    background: oklch(var(--p) / 0.12);
    color: oklch(var(--bc));
    font-weight: 700;
  }

  .hai-ai-doc-selection-chip:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-ai-doc-selection-btn {
    min-width: 2.35rem;
    padding: 0 0.75rem;
    background: oklch(var(--b2));
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-btn-wide {
    min-width: 3.75rem;
  }

  .hai-ai-doc-rewrite-menu {
    width: 13.75rem;
    display: grid;
    gap: 0.375rem;
    padding: 0.5rem;
    border-radius: 1.125rem;
    background: oklch(var(--b1) / 0.98);
    border: 1px solid oklch(var(--bc) / 0.08);
    box-shadow: 0 10px 26px oklch(var(--bc) / 0.16);
    pointer-events: auto;
  }

  .hai-ai-doc-rewrite-menu button {
    text-align: left;
    border: none;
    border-radius: 0.875rem;
    padding: 0.7rem 0.8rem;
    color: inherit;
    background: oklch(var(--b2));
  }

  .hai-ai-doc-rewrite-menu button:hover {
    background: oklch(var(--bc) / 0.05);
  }

  .hai-ai-doc-rewrite-menu button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-markdown {
    line-height: 1.9;
    color: inherit;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .hai-markdown-document {
    max-width: 52.5rem;
    margin: 0 auto;
    padding: 1.25rem 2rem 6rem;
    outline: none;
  }

  .hai-markdown-document.hai-markdown-editable {
    min-height: 100%;
  }

  .hai-markdown :global(h1),
  .hai-markdown :global(h2),
  .hai-markdown :global(h3),
  .hai-markdown :global(h4),
  .hai-markdown :global(h5),
  .hai-markdown :global(h6) {
    font-weight: 700;
    line-height: 1.25;
    margin-top: 1.6em;
    margin-bottom: 0.75em;
    letter-spacing: -0.02em;
    color: oklch(var(--bc));
    scroll-margin-top: 1rem;
  }

  .hai-markdown :global(h1) {
    font-size: 2.2rem;
    padding-bottom: 0.45em;
    border-bottom: 1px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(h2) {
    font-size: 1.48rem;
  }

  .hai-markdown :global(h3) {
    font-size: 1.18rem;
  }

  .hai-markdown :global(h4) {
    font-size: 1.02rem;
  }

  .hai-markdown :global(h5) {
    font-size: 0.95rem;
  }

  .hai-markdown :global(h6) {
    font-size: 0.88rem;
    color: oklch(var(--bc) / 0.7);
  }

  .hai-markdown :global(:first-child) {
    margin-top: 0;
  }

  .hai-markdown :global(p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  .hai-markdown :global(a) {
    color: oklch(var(--p));
    text-decoration: none;
    font-weight: 500;
  }

  .hai-markdown :global(a:hover) {
    text-decoration: underline;
  }

  .hai-markdown :global(strong) {
    font-weight: 700;
  }

  .hai-markdown :global(em) {
    font-style: italic;
  }

  .hai-markdown :global(del) {
    text-decoration: line-through;
    color: oklch(var(--bc) / 0.55);
  }

  .hai-markdown :global(:not(pre) > code) {
    padding: 0.2em 0.4em;
    margin: 0 0.1em;
    font-size: 0.875em;
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
      'Liberation Mono', monospace;
    background: oklch(var(--bc) / 0.08);
    border-radius: 0.375rem;
    word-break: break-word;
  }

  .hai-markdown :global(.hai-md-code-block) {
    position: relative;
    margin: 1em 0;
    border-radius: 0.95rem;
    overflow: hidden;
    background: oklch(var(--n));
    color: oklch(var(--nc));
    box-shadow: 0 10px 26px oklch(var(--bc) / 0.08);
  }

  .hai-markdown :global(.hai-md-code-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 1rem;
    min-height: 2.5rem;
    background: oklch(var(--n) / 0.94);
    border-bottom: 1px solid oklch(var(--nc) / 0.1);
  }

  .hai-markdown :global(.hai-md-code-header-main) {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .hai-markdown :global(.hai-md-code-actions) {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .hai-markdown :global(.hai-md-code-lang) {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: oklch(var(--nc) / 0.6);
    user-select: none;
  }

  .hai-markdown :global(.hai-md-code-lang-empty) {
    opacity: 0.7;
  }

  .hai-markdown :global(.hai-md-code-action) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.45rem;
    background: transparent;
    color: oklch(var(--nc) / 0.55);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .hai-markdown :global(.hai-md-code-action:hover) {
    background: oklch(var(--nc) / 0.1);
    color: oklch(var(--nc) / 0.92);
  }

  .hai-markdown :global(.hai-md-copy-btn.hai-md-copied) {
    color: oklch(var(--su, 0.7 0.15 160));
  }

  .hai-markdown :global(.hai-md-code-block pre) {
    margin: 0;
    padding: 1rem;
    overflow-x: auto;
    background: transparent;
  }

  .hai-markdown :global(.hai-md-code-block code) {
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
      'Liberation Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    tab-size: 2;
  }

  .hai-markdown :global(.hai-md-code-preview-slot) {
    border-top: 1px solid oklch(var(--nc) / 0.08);
    background: oklch(var(--b1));
  }

  .hai-markdown :global(blockquote) {
    margin: 1em 0;
    padding: 0.65em 1.1em;
    border-left: 4px solid oklch(var(--p) / 0.4);
    background: oklch(var(--bc) / 0.03);
    border-radius: 0 0.5rem 0.5rem 0;
    color: oklch(var(--bc) / 0.85);
  }

  .hai-markdown :global(blockquote p:last-child) {
    margin-bottom: 0;
  }

  .hai-markdown :global(ul),
  .hai-markdown :global(ol) {
    margin: 0.5em 0 1em;
    padding-left: 2em;
  }

  .hai-markdown :global(ul) {
    list-style-type: disc;
  }

  .hai-markdown :global(ol) {
    list-style-type: decimal;
  }

  .hai-markdown :global(li) {
    margin: 0.25em 0;
    line-height: 1.7;
  }

  .hai-markdown :global(li > ul),
  .hai-markdown :global(li > ol) {
    margin: 0.25em 0;
  }

  .hai-markdown :global(ul ul) {
    list-style-type: circle;
  }

  .hai-markdown :global(ul ul ul) {
    list-style-type: square;
  }

  .hai-markdown :global(ul:has(> li > input[type='checkbox'])) {
    list-style: none;
    padding-left: 0;
  }

  .hai-markdown :global(li > input[type='checkbox']) {
    margin-right: 0.5em;
    vertical-align: middle;
    accent-color: oklch(var(--p));
  }

  .hai-markdown :global(.hai-md-table-wrap) {
    margin: 1em 0;
    overflow-x: auto;
    border-radius: 0.5rem;
    border: 1px solid oklch(var(--bc) / 0.1);
  }

  .hai-markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }

  .hai-markdown :global(thead) {
    background: oklch(var(--bc) / 0.04);
  }

  .hai-markdown :global(th) {
    font-weight: 600;
    text-align: left;
    padding: 0.75rem 1rem;
    border-bottom: 2px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(td) {
    padding: 0.625rem 1rem;
    border-bottom: 1px solid oklch(var(--bc) / 0.06);
  }

  .hai-markdown :global(tr:last-child td) {
    border-bottom: none;
  }

  .hai-markdown :global(tbody tr:hover) {
    background: oklch(var(--bc) / 0.02);
  }

  .hai-markdown :global(hr) {
    height: 0;
    margin: 2em 0;
    border: 0;
    border-top: 1px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(.hai-md-img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1em 0;
  }

  .hai-markdown :global(kbd) {
    padding: 0.15em 0.4em;
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: oklch(var(--bc) / 0.06);
    border: 1px solid oklch(var(--bc) / 0.15);
    border-radius: 0.25rem;
    box-shadow: inset 0 -1px 0 oklch(var(--bc) / 0.1);
  }

  .hai-md-preview-card {
    margin: 0;
    padding: 1rem;
    background: oklch(var(--b1));
    color: oklch(var(--bc));
  }

  .hai-md-preview-head {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(var(--bc) / 0.7);
  }

  .hai-md-preview-desc {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: oklch(var(--bc) / 0.7);
  }

  :global(.hai-md-preview-card pre) {
    margin: 0.85rem 0 0;
    padding: 0.85rem 1rem;
    overflow-x: auto;
    border-radius: 0.85rem;
    background: oklch(var(--b2));
    font-size: 0.85rem;
  }

  :global(.hai-md-preview-card.hai-md-preview-error pre) {
    color: oklch(var(--er));
  }

  .hai-md-preview-frame {
    display: block;
    width: 100%;
    min-height: 280px;
    margin-top: 0.85rem;
    border: 1px solid oklch(var(--bc) / 0.1);
    border-radius: 1rem;
    background: white;
  }

  .hai-md-preview-loading {
    width: 100%;
    height: 4px;
    margin-top: 0.85rem;
    border-radius: 9999px;
    background: linear-gradient(
      90deg,
      oklch(var(--p) / 0.15) 0%,
      oklch(var(--p) / 0.5) 50%,
      oklch(var(--p) / 0.15) 100%
    );
    background-size: 220px 100%;
    animation: hai-md-loading 1.2s linear infinite;
  }

  .hai-md-preview-rendered :global(:first-child) {
    margin-top: 0.85rem;
  }

  .hai-markdown :global(.hljs-keyword),
  .hai-markdown :global(.hljs-selector-tag),
  .hai-markdown :global(.hljs-literal),
  .hai-markdown :global(.hljs-section),
  .hai-markdown :global(.hljs-link) {
    color: oklch(0.7 0.15 280);
  }

  .hai-markdown :global(.hljs-string),
  .hai-markdown :global(.hljs-addition) {
    color: oklch(0.75 0.12 150);
  }

  .hai-markdown :global(.hljs-number),
  .hai-markdown :global(.hljs-type) {
    color: oklch(0.78 0.12 70);
  }

  .hai-markdown :global(.hljs-comment),
  .hai-markdown :global(.hljs-quote),
  .hai-markdown :global(.hljs-meta) {
    color: oklch(var(--nc) / 0.45);
    font-style: italic;
  }

  .hai-markdown :global(.hljs-title),
  .hai-markdown :global(.hljs-name) {
    color: oklch(0.75 0.12 210);
  }

  .hai-markdown :global(.hljs-variable),
  .hai-markdown :global(.hljs-template-variable) {
    color: oklch(0.8 0.1 30);
  }

  .hai-markdown :global(.hljs-built_in),
  .hai-markdown :global(.hljs-builtin-name) {
    color: oklch(0.75 0.15 200);
  }

  .hai-markdown :global(.hljs-attr),
  .hai-markdown :global(.hljs-attribute) {
    color: oklch(0.78 0.1 80);
  }

  .hai-markdown :global(.hljs-symbol),
  .hai-markdown :global(.hljs-bullet) {
    color: oklch(0.75 0.12 320);
  }

  .hai-markdown :global(.hljs-deletion) {
    color: oklch(0.7 0.15 25);
  }

  .hai-markdown :global(.hljs-regexp),
  .hai-markdown :global(.hljs-selector-id),
  .hai-markdown :global(.hljs-selector-class) {
    color: oklch(0.7 0.15 25);
  }

  .hai-markdown :global(.hljs-emphasis) {
    font-style: italic;
  }

  .hai-markdown :global(.hljs-strong) {
    font-weight: 700;
  }

  @keyframes hai-md-loading {
    from {
      background-position: 220px 0;
    }

    to {
      background-position: -220px 0;
    }
  }

  @media (max-width: 960px) {
    .hai-ai-doc-layout,
    .hai-ai-doc-layout.hai-ai-doc-layout-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }

    .hai-ai-doc-outline {
      display: none;
    }

    .hai-ai-doc-topbar {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .hai-ai-doc-heading-row {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }

  @media (max-width: 640px) {
    .hai-ai-doc-meta-bar,
    .hai-ai-doc-heading-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .hai-ai-doc-toolbar,
    .hai-ai-doc-heading-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .hai-ai-doc-scroll {
      padding-bottom: 1rem;
    }

    .hai-markdown-document {
      padding-left: 1.125rem;
      padding-right: 1.125rem;
    }

    .hai-ai-doc-selection-toolbar {
      max-width: calc(100vw - 2rem);
      overflow: auto;
    }
  }
</style>
