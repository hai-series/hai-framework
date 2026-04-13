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
})
