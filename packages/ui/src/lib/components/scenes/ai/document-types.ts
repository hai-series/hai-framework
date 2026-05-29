/**
 * Markdown source type, used to distinguish plain markdown, document panel, or code-only rendering.
 */
export type MarkdownSourceKind = 'markdown' | 'document' | 'code'

export interface MarkdownOutlineItem {
  /** Anchor id for outline navigation and heading sync. */
  id: string
  /** Plain heading text without inline markdown formatting. */
  text: string
  /** Heading level (1-6), mapping to h1-h6. */
  level: number
  /** Numbered heading text for outline display. */
  numberedTitle: string
}

export interface MarkdownCodeBlockItem {
  /** Stable code block id used by preview and DOM bindings. */
  id: string
  /** Raw code text before highlighting. */
  code: string
  /** Detected language label, if any. */
  language?: string
}

export interface MarkdownCodeRunRequest {
  /** Code block id for mapping results back to the preview slot. */
  blockId: string
  /** Raw code text. */
  code: string
  /** Code language for runtime branching. */
  language?: string
  /** Current document title for preview metadata or logging. */
  title?: string
  /** Source kind for contextual runtime decisions. */
  sourceKind: MarkdownSourceKind
}

export interface MarkdownCodeRunResult {
  /** Output kind that drives preview rendering. */
  kind?: 'text' | 'markdown' | 'html'
  /** Preview output content. */
  content: string
  /** Preview title; default text is used when omitted. */
  title?: string
  /** Optional preview description. */
  description?: string
  /**
   * 预览 iframe 是否允许执行脚本。
   *
   * 默认值为空，组件会以最严格的 sandbox 渲染 HTML 预览；
   * 只有调用方显式声明后才会放开 `allow-scripts`。
   */
  allowScripts?: boolean
}

export interface MarkdownRewriteAction {
  /** Rewrite action id used in callbacks. */
  id: string
  /** User-facing label for the rewrite action. */
  label: string
}

export interface MarkdownRewriteRequest {
  /** Rewrite action id associated with the UI action. */
  actionId: string
  /** The selected source text. */
  selectedText: string
  /** Full document content at the time of the request. */
  content: string
  /** Current document title. */
  title?: string
}

/**
 * Legacy block-level format actions preserved for backward compatibility.
 */
export type MarkdownBlockFormatKind
  = | 'heading'
    | 'bullet'

/**
 * Rich block-style actions used by the current editor toolbar.
 */
export type MarkdownBlockStyleKind
  = | 'paragraph'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'orderedList'
    | 'bulletList'

/**
 * Inline format actions for the editor toolbar.
 * `highlight` and `link` stay in the public union so older integrations keep compiling.
 */
export type MarkdownInlineFormatKind
  = | 'bold'
    | 'italic'
    | 'strike'
    | 'underline'
    | 'code'
    | 'highlight'
    | 'link'

/**
 * Paragraph alignment actions for the editor toolbar.
 */
export type MarkdownTextAlignKind = 'left' | 'center' | 'right' | 'justify'

export interface MarkdownSelectionSnapshot {
  /** Selection start offset within the plain-text document. */
  start: number
  /** Selection end offset within the plain-text document. */
  end: number
  /** Selected plain text, used as a fallback when structure changes. */
  text: string
}

/**
 * 颜色面板一次只会修改前景色或背景色中的一个维度。
 */
export interface MarkdownColorFormatRequest {
  /** `text` 表示文字颜色，`background` 表示文本底色。 */
  target: 'text' | 'background'
  /** 颜色值为空时表示恢复默认。 */
  value: string | null
  /** 当前工具条记住的选中文本，供外层在 DOM 重建后兜底恢复定位。 */
  selectedText?: string
  /** 当前工具条记住的精确选区偏移，优先用于重复文本场景的恢复。 */
  selectionSnapshot?: MarkdownSelectionSnapshot
}

export interface MarkdownLinkFormatRequest {
  /** 为空时表示移除当前链接。 */
  href: string | null
  /** 当前工具条记住的精确选区偏移。 */
  selectionSnapshot?: MarkdownSelectionSnapshot
  /** 当前工具条记住的选中文本，供宿主做文本兜底。 */
  selectedText?: string
}

export interface MarkdownToolbarDownloadAction {
  /** Action id used to identify the download target. */
  id: string
  /** Label shown in the download menu. */
  label: string
  /** Optional short badge displayed beside the menu label. */
  badgeLabel?: string
}

/**
 * Callback props are exposed to Svelte consumers, so we keep parameter checks bivariant.
 * This lets older handlers with narrower unions remain assignable while the component gains new APIs.
 */
type BivariantCallback<Args extends unknown[], Return = void> = {
  bivarianceHack: (...args: Args) => Return
}['bivarianceHack']

export interface AiDocumentEditorProps {
  /** Markdown source content. */
  content?: string
  /** Document title displayed in the header. */
  title?: string
  /** Source kind that affects rendering and interactions. */
  sourceKind?: MarkdownSourceKind
  /** Default language when sourceKind is `code`. */
  codeLanguage?: string
  /** Custom class for the outer container. */
  class?: string
  /** Whether to show the copy button on code blocks. */
  showCopyButton?: boolean
  /** Whether to show the run button on code blocks. */
  showRunButton?: boolean
  /** Whether to show the code/preview toggle on code blocks. */
  showCodePreviewToggle?: boolean
  /**
   * 是否启用内置的高风险代码预览。
   *
   * 默认仅允许 Markdown 预览；HTML / JS / CSS 等会执行或渲染任意代码的内置预览
   * 需要宿主显式开启，或由宿主通过 `oncoderun` 自行提供受控沙箱结果。
   */
  allowUnsafeCodePreview?: boolean
  /** Optional helper text displayed beside language when preview toggle is enabled. */
  codePreviewHint?: string
  /** Whether syntax highlighting is enabled. */
  enableHighlight?: boolean
  /** Whether soft line breaks are rendered as <br>. */
  breaks?: boolean
  /** Whether to show the left outline panel. */
  showOutline?: boolean
  /** Whether to show numbering prefixes in outline items. */
  showOutlineNumbering?: boolean
  /** Whether to show the top toolbar. */
  showToolbar?: boolean
  /** Initial outline collapsed state. */
  initialOutlineCollapsed?: boolean
  /** Status text shown in the header or toolbar. */
  statusText?: string
  /** Whether a rewrite flow is in progress. */
  rewritePending?: boolean
  /** Available rewrite actions; empty hides the menu. */
  rewriteActions?: MarkdownRewriteAction[]
  /** Callback fired when the close action is clicked. */
  onclose?: () => void
  /** Whether the close / back action should render as disabled. */
  closeDisabled?: boolean
  /** Callback fired when the undo action is clicked. */
  onundo?: () => void
  /** Whether the undo button should render as disabled. */
  undoDisabled?: boolean
  /** Callback fired when the redo action is clicked. */
  onredo?: () => void
  /** Whether the redo button should render as disabled. */
  redoDisabled?: boolean
  /** Code run handler that returns preview results. */
  oncoderun?: (
    request: MarkdownCodeRunRequest,
  ) => MarkdownCodeRunResult | void | Promise<MarkdownCodeRunResult | void>
  /** Selection rewrite handler for external processing. */
  onrewrite?: (request: MarkdownRewriteRequest) => void | Promise<void>
  /** Exposes the scroll container for external synchronization. */
  editorScrollHost?: HTMLDivElement | null
  /** Exposes the content container for editable reads. */
  previewHost?: HTMLElement | null
  /** Eyebrow label shown above the title. */
  eyebrow?: string
  /** Primary header text, shown with higher priority. */
  metaText?: string
  /** Pill status text shown near the title. */
  saveState?: string
  /** Whether the document body is contenteditable. */
  editable?: boolean
  /** Download menu items; defaults are used when empty. */
  downloadActions?: MarkdownToolbarDownloadAction[]
  /** Label for the history action. */
  historyActionLabel?: string
  /** Label for the view version action. */
  versionActionLabel?: string
  /** Scroll callback for syncing external state. */
  ondocumentscroll?: (event: Event) => void
  /** Mouseup callback to sync selection state. */
  onpreviewmouseup?: () => void
  /** Input callback for contenteditable changes. */
  onpreviewinput?: (event: Event) => void
  /** Blur callback for committing edits. */
  onpreviewblur?: () => void
  /** Callback fired when a download action is chosen. */
  ondownload?: (actionId: string) => void
  /** Callback fired when the history action is clicked. */
  onhistory?: () => void
  /** Custom full-document copy handler. */
  oncopydocument?: () => void | Promise<void>
  /** Legacy block-format action handler for older heading / bullet integrations. */
  onapplyblockformat?: BivariantCallback<[kind: MarkdownBlockFormatKind], void>
  /** Rich block-style handler for paragraph and concrete heading-level changes. */
  onapplyblockstyle?: BivariantCallback<[kind: MarkdownBlockStyleKind], void>
  /** Inline-format action handler from the selection toolbar. */
  onapplyinlineformat?: BivariantCallback<[kind: MarkdownInlineFormatKind], void>
  /** Paragraph alignment handler from the selection toolbar. */
  onapplyalignment?: (kind: MarkdownTextAlignKind) => void
  /** Link add / edit / remove handler from the selection toolbar. */
  onapplylink?: BivariantCallback<[
    href: string | null,
    selectionSnapshot?: MarkdownSelectionSnapshot,
    selectedText?: string,
  ], void>
  /** Text or background color handler from the selection toolbar. */
  onapplycolor?: (request: MarkdownColorFormatRequest) => void
  /** Selection copy handler for custom behavior. */
  oncopyselection?: () => void | Promise<void>
  /** Selection annotation handler. */
  onannotation?: () => void | Promise<void>
}
