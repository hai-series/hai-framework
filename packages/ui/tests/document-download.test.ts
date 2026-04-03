import { describe, expect, it } from 'vitest'
import {
  resolveDocumentDownloadActions,
  resolveDocumentMarkdownContent,
} from '../src/lib/components/scenes/ai/document-download'

describe('document-download', () => {
  it('falls back to the built-in download action order', () => {
    expect(resolveDocumentDownloadActions()).toEqual([
      {
        id: 'word',
        label: 'Word',
        badgeLabel: 'DOC',
      },
      {
        id: 'pdf',
        label: 'PDF',
        badgeLabel: 'PDF',
      },
      {
        id: 'markdown',
        label: 'Markdown',
        badgeLabel: 'MD',
      },
    ])
  })

  it('preserves custom download labels while filling missing badges', () => {
    expect(resolveDocumentDownloadActions([
      { id: 'markdown', label: '导出 Markdown' },
      { id: 'custom-export', label: '导出其他格式' },
    ])).toEqual([
      {
        id: 'markdown',
        label: '导出 Markdown',
        badgeLabel: 'MD',
      },
      {
        id: 'custom-export',
        label: '导出其他格式',
        badgeLabel: 'CUST',
      },
    ])
  })

  it('wraps code downloads into fenced markdown without mutating regular markdown', () => {
    expect(resolveDocumentMarkdownContent('console.log(1)', 'code', 'ts')).toBe(
      '```ts\nconsole.log(1)\n```',
    )

    expect(resolveDocumentMarkdownContent('# Title', 'document')).toBe('# Title')
  })

  it('expands the fence length when the code already contains triple backticks', () => {
    expect(resolveDocumentMarkdownContent('```js\nalert(1)\n```', 'code', 'md')).toBe(
      '````md\n```js\nalert(1)\n```\n````',
    )
  })
})
