/**
 * @h-ai/ui — AI 场景组件 (AI Scenes)
 *
 * 面向 AI 交互场景的组件，包含 Markdown 渲染器等。
 * 内置中英文翻译，自动响应全局 locale。
 * @module index
 */

export { default as AiDocumentEditor } from './AiDocumentEditor.svelte'
export { renderMarkdownDocument } from './document-parse.js'
export type {
  MarkdownDocumentParseOptions,
  MarkdownRenderResult,
} from './document-parse.js'
export type {
  AiDocumentEditorProps,
  MarkdownBlockFormatKind,
  MarkdownCodeBlockItem,
  MarkdownCodeRunRequest,
  MarkdownCodeRunResult,
  MarkdownInlineFormatKind,
  MarkdownOutlineItem,
  MarkdownRewriteAction,
  MarkdownRewriteRequest,
  MarkdownToolbarDownloadAction,
} from './document-types.js'
export { parseMarkdown } from './markdown-parse.js'
export type { MarkdownParseOptions } from './markdown-parse.js'
export { default as MarkdownRenderer } from './MarkdownRenderer.svelte'
