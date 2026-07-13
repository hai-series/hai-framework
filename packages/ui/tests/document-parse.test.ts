import { describe, expect, it } from 'vitest'
import { renderMarkdownDocument } from '../src/lib/components/scenes/ai/document-parse.js'

function getHtmlOutput(markdown: string): string {
  return renderMarkdownDocument(markdown).blocks.filter(block => block.kind === 'html').map(block => block.html).join('\n')
}

describe('renderMarkdownDocument', () => {
  it('keeps outline extraction working when headings are wrapped by align and color extensions', () => {
    const result = renderMarkdownDocument(
      '<hai-align value="center">\n## <hai-span color="#2563eb">标题</hai-span>\n</hai-align>\n\n正文',
    )
    const html = getHtmlOutput(
      '<hai-align value="center">\n## <hai-span color="#2563eb">标题</hai-span>\n</hai-align>\n\n正文',
    )

    expect(html).toContain('data-hai-align="center"')
    expect(html).toContain('color:#2563eb')
    expect(html).toContain('data-hai-color="#2563eb"')
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

    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'mermaid',
        codeBlockId: 'hai-md-code-1',
      }),
    ])
    expect(result.codeBlocks).toEqual([
      {
        id: 'hai-md-code-1',
        code: 'flowchart TD\n  A --> B',
        language: 'mermaid',
      },
    ])
  })

  it('阅读态把已闭合 mermaid fence 拆成稳定 block，避免流式更新销毁图表 DOM', () => {
    const result = renderMarkdownDocument([
      '# 标题',
      '',
      '正文',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '后续内容',
    ].join('\n'))

    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'html',
        html: expect.stringContaining('<h1'),
      }),
      {
        kind: 'mermaid',
        id: 'hai-md-block-2',
        codeBlockId: 'hai-md-code-1',
        code: 'flowchart TD\n  A --> B',
        language: 'mermaid',
        signature: JSON.stringify(['hai-md-code-1', 'flowchart TD\n  A --> B']),
      },
      expect.objectContaining({
        kind: 'html',
        html: expect.stringContaining('后续内容'),
      }),
    ])
  })

  it('阅读态 Mermaid block 导出源码而不是旧的 host HTML', () => {
    const result = renderMarkdownDocument('```mermaid\nflowchart TD\n  A --> B\n```')

    expect(result.blocks).toEqual([
      {
        kind: 'mermaid',
        id: 'hai-md-block-1',
        codeBlockId: 'hai-md-code-1',
        code: 'flowchart TD\n  A --> B',
        language: 'mermaid',
        signature: JSON.stringify(['hai-md-code-1', 'flowchart TD\n  A --> B']),
      },
    ])
  })

  it('流式输出未闭合 mermaid fence 时不提前渲染图表', () => {
    const result = renderMarkdownDocument('```mermaid\nmindmap\n  root((A))')
    const html = result.blocks
      .filter(block => block.kind === 'html')
      .map(block => block.html)
      .join('\n')

    expect(html).toContain('hai-md-code-block')
    expect(html).not.toContain('data-mermaid-host')
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'html',
        html: expect.stringContaining('hai-md-code-block'),
      }),
    ])
    expect(result.codeBlocks).toEqual([
      {
        id: 'hai-md-code-1',
        code: 'mindmap\n  root((A))',
        language: 'mermaid',
      },
    ])
  })

  it('稳定 block 渲染保持 Mermaid 前后代码块 id 连续', () => {
    const result = renderMarkdownDocument([
      '```ts',
      'const before = 1',
      '```',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '```ts',
      'const after = 2',
      '```',
    ].join('\n'), {
      showRunButton: true,
    })

    expect(result.blocks[0]).toEqual(expect.objectContaining({
      kind: 'html',
      html: expect.stringContaining('data-code-block-id="hai-md-code-1"'),
    }))
    expect(result.blocks[1]).toEqual(expect.objectContaining({
      kind: 'mermaid',
      codeBlockId: 'hai-md-code-2',
    }))
    expect(result.blocks[2]).toEqual(expect.objectContaining({
      kind: 'html',
      html: expect.stringContaining('data-code-block-id="hai-md-code-3"'),
    }))
    expect(result.codeBlocks.map(block => block.id)).toEqual([
      'hai-md-code-1',
      'hai-md-code-2',
      'hai-md-code-3',
    ])
  })

  it('code/preview 切换模式下 mermaid 仍走代码块渲染以保留源码视图', () => {
    const result = renderMarkdownDocument('```mermaid\nflowchart TD\n  A --> B\n```', {
      showCodePreviewToggle: true,
    })
    const html = result.blocks
      .filter(block => block.kind === 'html')
      .map(block => block.html)
      .join('\n')

    expect(html).toContain('hai-md-code-block')
    expect(html).not.toContain('data-mermaid-host')
  })

  it('allowHtmlTags 开启时应该解析安全 HTML，并继续转义危险标签', () => {
    const result = renderMarkdownDocument('# 标题\n\n支持 <b>重点</b> 与 <script>alert(1)</script>', {
      allowHtmlTags: true,
    })
    const html = result.blocks
      .filter(block => block.kind === 'html')
      .map(block => block.html)
      .join('\n')

    expect(html).toContain('<b>重点</b>')
    expect(html).toContain('&lt;script&gt;')
    expect(result.outline[0]?.text).toBe('标题')
  })
})
