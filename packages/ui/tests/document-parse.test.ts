import { describe, expect, it } from 'vitest'
import { renderMarkdownDocument } from '../src/lib/components/scenes/ai/document-parse.js'

describe('renderMarkdownDocument', () => {
  it('keeps outline extraction working when headings are wrapped by align and color extensions', () => {
    const result = renderMarkdownDocument(
      '<hai-align value="center">\n## <hai-span color="#2563eb">标题</hai-span>\n</hai-align>\n\n正文',
    )

    expect(result.html).toContain('data-hai-align="center"')
    expect(result.html).toContain('color:#2563eb')
    expect(result.html).toContain('data-hai-color="#2563eb"')
    expect(result.outline).toEqual([
      {
        id: '标题',
        text: '标题',
        level: 2,
        numberedTitle: '1 标题',
      },
    ])
  })

  it('阅读态把 mermaid 代码块渲染为自动渲染占位，并保留源码到 codeBlocks', () => {
    const result = renderMarkdownDocument('```mermaid\nflowchart TD\n  A --> B\n```')

    expect(result.html).toContain('hai-md-mermaid')
    expect(result.html).toContain('data-mermaid-host="hai-md-code-1"')
    expect(result.html).not.toContain('hai-md-code-block')
    expect(result.codeBlocks).toEqual([
      {
        id: 'hai-md-code-1',
        code: 'flowchart TD\n  A --> B',
        language: 'mermaid',
      },
    ])
  })

  it('code/preview 切换模式下 mermaid 仍走代码块渲染以保留源码视图', () => {
    const result = renderMarkdownDocument('```mermaid\nflowchart TD\n  A --> B\n```', {
      showCodePreviewToggle: true,
    })

    expect(result.html).toContain('hai-md-code-block')
    expect(result.html).not.toContain('data-mermaid-host')
  })
})
