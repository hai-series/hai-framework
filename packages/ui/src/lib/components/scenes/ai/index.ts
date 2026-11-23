/**
 * @h-ai/ui — AI 场景组件 (AI Scenes)
 *
 * 面向 AI 交互场景的组件，包含 Markdown 渲染器等。
 * 内置中英文翻译，自动响应全局 locale。
 * @module index
 */

import { downloadAiDocument, resolveDocumentDownloadActions, resolveDocumentMarkdownContent } from './document-download.js'
import { renderMarkdownDocument } from './document-parse.js'
import { highlightCode, isLanguageSupported } from './highlight.js'
import { parseMarkdown } from './markdown-parse.js'
import { fromMindElixirData, toMindElixirData } from './mind/mind-adapter.js'

export { default as AiDocumentDownloadMenu } from './AiDocumentDownloadMenu.svelte'
export { default as AiDocumentEditor } from './AiDocumentEditor.svelte'

export type {
  AiDocumentDownloadFormat,
  AiDocumentDownloadRequest,
  AiDocumentResolvedDownloadAction,
} from './document-download.js'

export type {
  MarkdownDocumentBlock,
  MarkdownDocumentHtmlBlock,
  MarkdownDocumentMermaidBlock,
  MarkdownDocumentParseOptions,
  MarkdownRenderResult,
} from './document-parse.js'
export type {
  AiDocumentEditorProps,
  MarkdownBlockStyleKind,
  MarkdownCodeBlockItem,
  MarkdownCodeRunRequest,
  MarkdownCodeRunResult,
  MarkdownColorFormatRequest,
  MarkdownInlineFormatKind,
  MarkdownOutlineItem,
  MarkdownRewriteAction,
  MarkdownRewriteRequest,
  MarkdownSourceRange,
  MarkdownTextAlignKind,
  MarkdownToolbarDownloadAction,
} from './document-types.js'
// Shiki 同步语法高亮（CSS Variables 主题，DaisyUI 自适应）

export type { MarkdownParseOptions } from './markdown-parse.js'
export { default as MarkdownRenderer } from './MarkdownRenderer.svelte'
export { default as AiMindMapEditor } from './mind/AiMindMapEditor.svelte'

export type { AiMindMapChangePayload, AiMindMapData, AiMindMapEditorProps, AiMindMapExportFormat, AiMindMapNode, AiMindMapSelection } from './mind/mind-types.js'
export { default as AiTableEditor } from './table/AiTableEditor.svelte'
export type {
  AiTableColumn,
  AiTableColumnType,
  AiTableCopyPayload,
  AiTableData,
  AiTableDownloadPayload,
  AiTableEditorChangeAction,
  AiTableEditorChangePayload,
  AiTableEditorProps,
  AiTableRow,
} from './table/table-types.js'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/scenes/ai/index'
 *
 * // 将已提供的 Markdown 转为渲染结果。
 * const rendered = ui.parseMarkdown('## 示例')
 * void rendered
 * ```
 */
export const ui = {
  downloadAiDocument,
  resolveDocumentDownloadActions,
  resolveDocumentMarkdownContent,
  renderMarkdownDocument,
  highlightCode,
  isLanguageSupported,
  parseMarkdown,
  fromMindElixirData,
  toMindElixirData,
}
