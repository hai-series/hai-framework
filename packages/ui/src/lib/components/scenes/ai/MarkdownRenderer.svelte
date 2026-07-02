<!--
  =============================================================================
  @h-ai/ui - MarkdownRenderer 组件
  =============================================================================
  通用 Markdown 渲染器，适用于 AI 输出显示、文档预览等场景。

  功能特性：
  - GFM (GitHub Flavored Markdown) 全量支持
  - 代码块语法高亮（Shiki，30+ 语言）
  - 代码块一键复制
  - 响应式表格
  - 任务列表
  - DaisyUI 主题自适应

  使用 Svelte 5 Runes ($props, $derived, $effect)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { MarkdownRendererProps } from '../types.js'
  import { writeTextToClipboard } from '../../../internal/browser-safety.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import { parseMarkdown } from './markdown-parse.js'

  const {
    content = '',
    fontSize,
    class: className = '',
    showCopyButton = true,
    enableHighlight = true,
    breaks = true,
    allowHtmlTags = false,
    ...restProps
  }: MarkdownRendererProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const normalizedFontSize = $derived(resolveFontSize(fontSize))
  const markdownStyle = $derived(
    normalizedFontSize
      ? `--hai-markdown-font-size:${normalizedFontSize};`
      : undefined,
  )
  /** 解析后的 HTML */
  const html = $derived(
    parseMarkdown(content, {
      enableHighlight,
      showCopyButton,
      breaks,
      allowHtmlTags,
    }),
  )

  function resolveFontSize(value: MarkdownRendererProps['fontSize']): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value}px`
    }

    if (typeof value === 'string') {
      const normalized = value.trim()
      return normalized || undefined
    }

    return undefined
  }

  /**
   * 事件代理：处理代码块复制按钮点击
   */
  async function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    const btn = target.closest('[data-copy-code]') as HTMLButtonElement | null
    if (!btn)
      return

    const codeBlock = btn.closest('.hai-md-code-block')
    const codeEl = codeBlock?.querySelector('code')
    if (!codeEl)
      return

    const text = codeEl.textContent ?? ''
    if (!await writeTextToClipboard(text))
      return

    btn.classList.add('hai-md-copied')
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

    window.setTimeout(() => {
      btn.classList.remove('hai-md-copied')
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
    }, 2000)
  }
</script>

<div
  {...dataAttributes}
  class={cn('hai-markdown', className)}
  style={markdownStyle}
  onclick={handleClick}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown HTML 渲染 -->
  {@html html}
</div>

<style>
  /* =========================================================================
   * Markdown 渲染容器 - 基础排版
   * =========================================================================
   * 使用 DaisyUI CSS 变量实现主题自适应
   * ========================================================================= */

  .hai-markdown {
    font-size: var(--hai-markdown-font-size, 1rem);
    line-height: 1.75;
    color: inherit;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* ─── 标题 ─── */

  .hai-markdown :global(h1),
  .hai-markdown :global(h2),
  .hai-markdown :global(h3),
  .hai-markdown :global(h4),
  .hai-markdown :global(h5),
  .hai-markdown :global(h6) {
    font-weight: 700;
    line-height: 1.3;
    margin-top: 1.5em;
    margin-bottom: 0.75em;
  }

  .hai-markdown :global(h1) {
    font-size: 2em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid oklch(var(--bc) / 0.15);
  }

  .hai-markdown :global(h2) {
    font-size: 1.5em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid oklch(var(--bc) / 0.1);
  }

  .hai-markdown :global(h3) {
    font-size: 1.25em;
  }

  .hai-markdown :global(h4) {
    font-size: 1.1em;
  }

  .hai-markdown :global(h5) {
    font-size: 1em;
  }

  .hai-markdown :global(h6) {
    font-size: 0.875em;
    color: oklch(var(--bc) / 0.7);
  }

  /* 第一个标题不需要上边距 */
  .hai-markdown :global(:first-child) {
    margin-top: 0;
  }

  /* ─── 段落 ─── */

  .hai-markdown :global(p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  /* ─── 链接 ─── */

  .hai-markdown :global(a) {
    color: oklch(var(--p));
    text-decoration: none;
    font-weight: 500;
    transition: color 0.15s ease;
  }

  .hai-markdown :global(a:hover) {
    color: oklch(var(--p) / 0.8);
    text-decoration: underline;
  }

  /* ─── 粗体、斜体、删除线 ─── */

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

  .hai-markdown :global(u) {
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.14em;
  }

  .hai-markdown :global(mark) {
    padding: 0 0.12em;
    border-radius: 0.25rem;
    background: oklch(var(--wa, 0.9 0.14 90) / 0.34);
    color: inherit;
  }

  /* ─── 行内代码 ─── */

  .hai-markdown :global(:not(pre) > code) {
    padding: 0.2em 0.4em;
    margin: 0 0.1em;
    font-size: 0.875em;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    background: oklch(var(--bc) / 0.08);
    border-radius: 0.375rem;
    word-break: break-word;
  }

  /* ─── 代码块容器 ─── */

  .hai-markdown :global(.hai-md-code-block) {
    position: relative;
    margin: 1em 0;
    border-radius: 0.75rem;
    overflow: hidden;
    background: oklch(var(--n));
    color: oklch(var(--nc));
  }

  .hai-markdown :global(.hai-md-code-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    min-height: 2.25rem;
    background: oklch(var(--n) / 0.9);
    border-bottom: 1px solid oklch(var(--nc) / 0.1);
  }

  .hai-markdown :global(.hai-md-code-lang) {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: oklch(var(--nc) / 0.6);
    user-select: none;
  }

  .hai-markdown :global(.hai-md-copy-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: oklch(var(--nc) / 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .hai-markdown :global(.hai-md-copy-btn:hover) {
    background: oklch(var(--nc) / 0.1);
    color: oklch(var(--nc) / 0.9);
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
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 0.875em;
    line-height: 1.6;
    tab-size: 2;
  }

  /* ─── 引用块 ─── */

  .hai-markdown :global(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid oklch(var(--p) / 0.4);
    background: oklch(var(--bc) / 0.03);
    border-radius: 0 0.5rem 0.5rem 0;
    color: oklch(var(--bc) / 0.85);
  }

  .hai-markdown :global(blockquote p:last-child) {
    margin-bottom: 0;
  }

  .hai-markdown :global(blockquote blockquote) {
    margin-top: 0.5em;
  }

  /* ─── 列表 ─── */

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
    line-height: 1.65;
  }

  .hai-markdown :global(li > ul),
  .hai-markdown :global(li > ol) {
    margin: 0.25em 0;
  }

  /* 嵌套列表样式 */
  .hai-markdown :global(ul ul) {
    list-style-type: circle;
  }

  .hai-markdown :global(ul ul ul) {
    list-style-type: square;
  }

  /* 任务列表 */
  .hai-markdown :global(ul:has(> li > input[type="checkbox"])) {
    list-style: none;
    padding-left: 0;
  }

  .hai-markdown :global(li > input[type="checkbox"]) {
    margin-right: 0.5em;
    vertical-align: middle;
    accent-color: oklch(var(--p));
  }

  /* ─── 表格 ─── */

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

  /* ─── 水平线 ─── */

  .hai-markdown :global(hr) {
    height: 0;
    margin: 2em 0;
    border: 0;
    border-top: 1px solid oklch(var(--bc) / 0.12);
  }

  /* ─── 图片 ─── */

  .hai-markdown :global(.hai-md-img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1em 0;
  }

  /* ─── KeyBoard 标签 ─── */

  .hai-markdown :global(kbd) {
    padding: 0.15em 0.4em;
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: oklch(var(--bc) / 0.06);
    border: 1px solid oklch(var(--bc) / 0.15);
    border-radius: 0.25rem;
    box-shadow: inset 0 -1px 0 oklch(var(--bc) / 0.1);
  }

  /* =========================================================================
   * Shiki 语法高亮主题 (DaisyUI 自适应)
   * =========================================================================
   * 使用 CSS Variables 主题，通过 --hai-hl-* 变量控制 token 颜色。
   * 变量由 highlight.ts 中的 createCssVariablesTheme 引用。
   * ========================================================================= */

  .hai-markdown :global(.hai-md-code-block code) {
    /* ─── 基础色 ─── */
    --hai-hl-foreground: oklch(var(--nc));
    --hai-hl-background: transparent;

    /* ─── Token 颜色（DaisyUI oklch 自适应） ─── */
    --hai-hl-token-keyword: oklch(0.7 0.15 280);
    --hai-hl-token-string: oklch(0.75 0.12 150);
    --hai-hl-token-string-expression: oklch(0.75 0.12 150);
    --hai-hl-token-constant: oklch(0.78 0.12 70);
    --hai-hl-token-comment: oklch(var(--nc) / 0.45);
    --hai-hl-token-function: oklch(0.72 0.14 220);
    --hai-hl-token-parameter: oklch(0.72 0.12 35);
    --hai-hl-token-punctuation: oklch(var(--nc) / 0.7);
    --hai-hl-token-link: oklch(0.7 0.15 280);
  }
</style>
