/**
 * @h-ai/ui — AI 场景组件 (AI Scenes)
 *
 * 面向 AI 交互场景的组件，包含 Markdown 渲染器等。
 * 内置中英文翻译，自动响应全局 locale。
 * @module index
 */

export { parseMarkdown } from './markdown-parse.js'
export type { MarkdownParseOptions } from './markdown-parse.js'
export { default as MarkdownRenderer } from './MarkdownRenderer.svelte'
