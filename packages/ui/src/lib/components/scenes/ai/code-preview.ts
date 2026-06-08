import type { MarkdownCodeRunRequest, MarkdownCodeRunResult } from './document-types.js'
import { isMermaidLanguage } from './mermaid-render.js'

const HTML_DOCUMENT_PATTERN = /<\s*(?:!doctype|html|body|head|div|section|article|main|span|style|script|svg|canvas)\b/i

const HTML_LANGUAGE_SET = new Set(['html', 'htm', 'xhtml', 'xml', 'svg'])
const JAVASCRIPT_LANGUAGE_SET = new Set(['javascript', 'js', 'typescript', 'ts'])
const CSS_LANGUAGE_SET = new Set(['css'])

export interface BuiltInCodePreviewOptions {
  /**
   * 是否允许执行内置的不安全代码预览。
   *
   * 默认仅允许 Markdown 预览；HTML / JS / CSS 预览需要显式 opt-in，
   * 否则组件会提示调用方提供自定义 oncoderun 或自行开启风险开关。
   */
  allowUnsafeCodePreview?: boolean
  previewTitle: string
}

/**
 * 根据运行结果构造 iframe sandbox 值。
 *
 * 默认不允许脚本执行；只有显式声明 `allowScripts` 时才放开 `allow-scripts`。
 */
export function resolvePreviewSandbox(allowScripts: boolean | undefined): string {
  return allowScripts ? 'allow-scripts' : ''
}

export function createBuiltInCodePreview(
  request: MarkdownCodeRunRequest,
  options: BuiltInCodePreviewOptions,
): MarkdownCodeRunResult | undefined {
  const language = (request.language ?? '').trim().toLowerCase()

  // mermaid 由 securityLevel:'strict' 渲染为消毒后的 SVG，无需 opt-in 高风险开关。
  if (isMermaidLanguage(language)) {
    return {
      kind: 'mermaid',
      title: options.previewTitle,
      content: request.code,
    }
  }

  if (language === 'markdown' || language === 'md') {
    return {
      kind: 'markdown',
      title: options.previewTitle,
      content: request.code,
    }
  }

  if (!options.allowUnsafeCodePreview) {
    return undefined
  }

  if (HTML_LANGUAGE_SET.has(language) || (!language && looksLikeHtml(request.code))) {
    return {
      kind: 'html',
      title: options.previewTitle,
      content: request.code,
      allowScripts: true,
    }
  }

  if (JAVASCRIPT_LANGUAGE_SET.has(language)) {
    return {
      kind: 'html',
      title: options.previewTitle,
      content: buildJavaScriptPreview(request.code),
      allowScripts: true,
    }
  }

  if (CSS_LANGUAGE_SET.has(language)) {
    return {
      kind: 'html',
      title: options.previewTitle,
      content: buildCssPreview(request.code),
    }
  }

  return undefined
}

function looksLikeHtml(code: string): boolean {
  return HTML_DOCUMENT_PATTERN.test(code)
}

function buildJavaScriptPreview(code: string): string {
  const safeCode = code.replace(/<\/script/gi, '<\\/script')

  return `<!doctype html>
<html lang="en">
  <body>
    <div id="app"></div>
    <script type="module">
${safeCode}
    </script>
  </body>
</html>`
}

function buildCssPreview(code: string): string {
  const sampleMarkup = [
    '<div class="hai-preview-shell">',
    '  <button class="hai-preview-button">Preview Button</button>',
    '  <div class="hai-preview-card">Preview Card</div>',
    '</div>',
  ].join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f5f5;
        font-family: system-ui, sans-serif;
      }
      .hai-preview-shell {
        display: grid;
        gap: 12px;
        padding: 24px;
      }
      .hai-preview-button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        background: #2563eb;
        color: white;
        font-size: 14px;
        cursor: pointer;
      }
      .hai-preview-card {
        padding: 16px;
        border-radius: 16px;
        background: white;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      }
${code}
    </style>
  </head>
  <body>
${sampleMarkup}
  </body>
</html>`
}
