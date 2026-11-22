import { describe, expect, it } from 'vitest'
import { resolveMarkdownSourceRange } from '../src/lib/components/scenes/ai/document-source-range.js'

describe('document rewrite source range', () => {
  it('points to the second identical word, while preserving Markdown delimiters', () => {
    const markdown = '**重复** / **重复**'
    const range = resolveMarkdownSourceRange(markdown, '重复 / 重复\n', {
      start: 5,
      end: 7,
      text: '重复',
    })
    expect(range).toEqual({ start: 11, end: 13, text: '重复' })
    expect(`${markdown.slice(0, range?.start)}更新${markdown.slice(range?.end)}`).toBe('**重复** / **更新**')
  })

  it('maps a checklist line after a heading with source positions', () => {
    const markdown = '## Requirements\n\n- **REQ-001** 记录设备\n- **REQ-002** 记录设备'
    const plain = 'Requirements\n\nREQ-001 记录设备\nREQ-002 记录设备\n\n'
    const start = plain.lastIndexOf('记录设备')
    expect(resolveMarkdownSourceRange(markdown, plain, { start, end: start + 4, text: '记录设备' })).toEqual({
      start: markdown.lastIndexOf('记录设备'),
      end: markdown.length,
      text: '记录设备',
    })
  })

  it('does not guess a range after the rendered content changed', () => {
    expect(resolveMarkdownSourceRange('**旧数据**', '新数据', { start: 0, end: 3, text: '新数据' })).toBeUndefined()
  })
})
