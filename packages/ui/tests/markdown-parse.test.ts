/**
 * =============================================================================
 * @h-ai/ui - Markdown 解析工具测试
 * =============================================================================
 * 覆盖 markdown-parse.ts 中的 parseMarkdown 函数：
 * - 基础 Markdown 渲染
 * - 代码块高亮与复制按钮
 * - XSS 防护（原始 HTML 转义、链接协议、图片协议）
 * - 表格渲染
 * - 空值与边界处理
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/lib/components/scenes/ai/markdown-parse.js'

// =============================================================================
// 基础渲染
// =============================================================================

describe('parseMarkdown - 基础渲染', () => {
  it('应该解析标题', () => {
    const html = parseMarkdown('# Hello')
    expect(html).toContain('<h1>')
    expect(html).toContain('Hello')
  })

  it('应该解析段落', () => {
    const html = parseMarkdown('Hello world')
    expect(html).toContain('<p>')
    expect(html).toContain('Hello world')
  })

  it('应该解析加粗与斜体', () => {
    const html = parseMarkdown('**bold** and *italic*')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('应该解析无序列表', () => {
    const html = parseMarkdown('- item1\n- item2')
    expect(html).toContain('<li>')
    expect(html).toContain('item1')
    expect(html).toContain('item2')
  })

  it('breaks 默认为 true，换行转 <br>', () => {
    const html = parseMarkdown('line1\nline2')
    expect(html).toContain('<br>')
  })

  it('breaks 为 false 时，换行不转 <br>', () => {
    const html = parseMarkdown('line1\nline2', { breaks: false })
    expect(html).not.toContain('<br>')
  })
})

// =============================================================================
// 代码块
// =============================================================================

describe('parseMarkdown - 代码块', () => {
  it('应该渲染代码块容器', () => {
    const html = parseMarkdown('```js\nconst x = 1\n```')
    expect(html).toContain('hai-md-code-block')
    expect(html).toContain('hai-md-code-header')
    expect(html).toContain('<pre><code')
  })

  it('应该显示语言标签', () => {
    const html = parseMarkdown('```typescript\nconst x: number = 1\n```')
    expect(html).toContain('hai-md-code-lang')
    expect(html).toContain('typescript')
  })

  it('应该显示复制按钮（默认）', () => {
    const html = parseMarkdown('```js\ncode\n```')
    expect(html).toContain('hai-md-copy-btn')
    expect(html).toContain('data-copy-code')
  })

  it('showCopyButton 为 false 时不显示复制按钮', () => {
    const html = parseMarkdown('```js\ncode\n```', { showCopyButton: false })
    expect(html).not.toContain('hai-md-copy-btn')
  })

  it('enableHighlight 为 false 时不高亮', () => {
    const html = parseMarkdown('```js\nconst x = 1\n```', { enableHighlight: false })
    // 无高亮时代码应被转义
    expect(html).toContain('<code class="hljs')
  })

  it('无语言标识的代码块也应正常渲染', () => {
    const html = parseMarkdown('```\nplain code\n```')
    expect(html).toContain('hai-md-code-block')
    expect(html).toContain('<pre><code')
  })
})

// =============================================================================
// XSS 防护
// =============================================================================

describe('parseMarkdown - XSS 防护', () => {
  it('应该转义原始 HTML 标签', () => {
    const html = parseMarkdown('<script>alert("xss")</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('应该转义 <img onerror> 攻击', () => {
    const html = parseMarkdown('<img src=x onerror=alert(1)>')
    // 原始 HTML 已被转义，不会以可执行标签形式存在
    expect(html).not.toContain('<img ')
    expect(html).toContain('&lt;img')
  })

  it('应该转义 <iframe> 标签', () => {
    const html = parseMarkdown('<iframe src="http://evil.com"></iframe>')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('&lt;iframe')
  })

  it('应该阻止 javascript: 协议链接', () => {
    const html = parseMarkdown('[click](javascript:alert(1))')
    expect(html).toContain('href=""')
    expect(html).not.toContain('javascript:')
  })

  it('应该允许安全链接协议', () => {
    const html = parseMarkdown('[http](https://example.com) [mail](mailto:a@b.com) [anchor](#id) [relative](/path)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="mailto:a@b.com"')
    expect(html).toContain('href="#id"')
    expect(html).toContain('href="/path"')
  })

  it('外部链接应添加 target="_blank" 和 noopener', () => {
    const html = parseMarkdown('[link](https://example.com)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('内部链接不应添加 target="_blank"', () => {
    const html = parseMarkdown('[link](/path)')
    expect(html).not.toContain('target="_blank"')
  })

  it('应该阻止危险图片协议', () => {
    const html = parseMarkdown('![img](javascript:alert(1))')
    expect(html).toContain('src=""')
    expect(html).not.toContain('javascript:')
  })

  it('应该允许安全图片协议', () => {
    const html = parseMarkdown('![img](https://example.com/img.png)')
    expect(html).toContain('src="https://example.com/img.png"')
  })

  it('应该允许 data:image/ 图片', () => {
    const html = parseMarkdown('![img](data:image/png;base64,abc)')
    expect(html).toContain('src="data:image/png;base64,abc"')
  })

  it('图片应添加 loading="lazy"', () => {
    const html = parseMarkdown('![img](https://example.com/img.png)')
    expect(html).toContain('loading="lazy"')
  })

  it('图片应有 alt 属性', () => {
    const html = parseMarkdown('![alt text](https://example.com/img.png)')
    expect(html).toContain('alt="alt text"')
  })
})

// =============================================================================
// 表格
// =============================================================================

describe('parseMarkdown - 表格', () => {
  it('应该渲染表格并包含响应式容器', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const html = parseMarkdown(md)
    expect(html).toContain('hai-md-table-wrap')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>')
    expect(html).toContain('<td>')
  })
})

// =============================================================================
// 空值与边界
// =============================================================================

describe('parseMarkdown - 边界处理', () => {
  it('空字符串应返回空字符串', () => {
    expect(parseMarkdown('')).toBe('')
  })

  it('undefined-like 空值应返回空字符串', () => {
    // @ts-expect-error 测试非法输入
    expect(parseMarkdown(undefined)).toBe('')
    // @ts-expect-error 测试非法输入
    expect(parseMarkdown(null)).toBe('')
  })

  it('纯空白应正常解析', () => {
    const html = parseMarkdown('   ')
    expect(typeof html).toBe('string')
  })

  it('不同 options 应触发实例重建', () => {
    const html1 = parseMarkdown('```js\ncode\n```', { showCopyButton: true })
    const html2 = parseMarkdown('```js\ncode\n```', { showCopyButton: false })
    expect(html1).toContain('hai-md-copy-btn')
    expect(html2).not.toContain('hai-md-copy-btn')
  })
})
