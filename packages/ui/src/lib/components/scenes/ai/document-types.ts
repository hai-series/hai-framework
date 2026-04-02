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
 * Block-level format actions for the editor toolbar.
 */
export type MarkdownBlockFormatKind = 'heading' | 'bullet'

/**
 * Inline format actions for the editor toolbar.
 */
export type MarkdownInlineFormatKind
  = | 'bold'
    | 'italic'
    | 'strike'
    | 'underline'
    | 'code'
    | 'highlight'
    | 'link'

export interface MarkdownToolbarDownloadAction {
  /** Action id used to identify the download target. */
  id: string
  /** Label shown in the download menu. */
  label: string
}

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
  /** Whether syntax highlighting is enabled. */
  enableHighlight?: boolean
  /** Whether soft line breaks are rendered as <br>. */
  breaks?: boolean
  /** Whether to show the left outline panel. */
  showOutline?: boolean
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
  /** Callback fired when the undo action is clicked. */
  onundo?: () => void
  /** Callback fired when the redo action is clicked. */
  onredo?: () => void
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
  /** Block-format action handler from the selection toolbar. */
  onapplyblockformat?: (kind: MarkdownBlockFormatKind) => void
  /** Inline-format action handler from the selection toolbar. */
  onapplyinlineformat?: (kind: MarkdownInlineFormatKind) => void
  /** Selection copy handler for custom behavior. */
  oncopyselection?: () => void | Promise<void>
  /** Selection annotation handler. */
  onannotation?: () => void | Promise<void>
}
