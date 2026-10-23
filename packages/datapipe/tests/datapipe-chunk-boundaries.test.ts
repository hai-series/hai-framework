import type { ChunkMode, DataChunk } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { ChunkOptionsSchema, datapipe, HaiDatapipeError } from '../src/index.js'

function reconstruct(chunks: DataChunk[], overlap: number): string {
  return chunks.map((chunk, index) => Array.from(chunk.content).slice(index === 0 ? 0 : overlap).join('')).join('')
}

describe('chunk exact bounds and source preservation', () => {
  it.each<ChunkMode>(['sentence', 'paragraph', 'character', 'page', 'custom'])('%s 包含 overlap/分隔符的长度始终有界且可还原全部原文', (mode) => {
    const text = '  甲😀。\n\n乙𠮷！\fAAA|||BBB\t\r\n末尾  '
    const result = datapipe.chunk(text, { mode, maxSize: 6, overlap: 2, separator: '(\\|\\|\\|)' })
    if (!result.success)
      throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(1)
    expect(result.data.every(chunk => Array.from(chunk.content).length <= 6)).toBe(true)
    for (let index = 1; index < result.data.length; index++) {
      const previous = Array.from(result.data[index - 1]!.content).slice(-2).join('')
      expect(Array.from(result.data[index]!.content).slice(0, 2).join('')).toBe(previous)
    }
    expect(reconstruct(result.data, 2)).toBe(text)
    expect(result.data.map(chunk => chunk.index)).toEqual(result.data.map((_, index) => index))
  })

  it('长段切片使用 maxSize-overlap 步长而不遗漏上下文', () => {
    const text = '甲😀乙𠮷丙丁戊己庚辛壬癸'
    const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 4, overlap: 1 })
    if (!result.success)
      throw new Error(result.error.message)
    expect(result.data[1]!.content).toBe('𠮷丙丁戊')
    expect(reconstruct(result.data, 1)).toBe(text)
    expect(result.data.every(chunk => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(chunk.content))).toBe(true)
  })

  it('word 使用非空白词计量，长中文词不按字符截断并保留所有空白', () => {
    const text = '  alpha\t中文没有空格😀\n beta   gamma\r\n delta  '
    const result = datapipe.chunk(text, { mode: 'word', maxSize: 3, overlap: 1 })
    if (!result.success)
      throw new Error(result.error.message)
    expect(result.data.every(chunk => [...chunk.content.matchAll(/\S+/gu)].length <= 3)).toBe(true)
    const restored = result.data.map((chunk, index) => {
      if (index === 0)
        return chunk.content
      const matches = [...chunk.content.matchAll(/\S+/gu)]
      return chunk.content.slice(matches[1]!.index)
    }).join('')
    expect(restored).toBe(text)
    expect(result.data.some(chunk => chunk.content.includes('中文没有空格😀'))).toBe(true)
  })

  it('markdown section 内复用同一上限和重叠，section 间不重复且忽略 fenced code 标题', () => {
    const text = '## 一\n甲😀乙丙丁戊己庚\n\n```md\n## 代码标题\n```\n## 二\n尾部  '
    const result = datapipe.chunk(text, { mode: 'markdown', maxSize: 8, overlap: 2 })
    if (!result.success)
      throw new Error(result.error.message)
    expect(result.data.every(chunk => Array.from(chunk.content).length <= 8)).toBe(true)
    expect(result.data.some(chunk => chunk.metadata?.title === '代码标题')).toBe(false)
    const first = reconstruct(result.data.filter(chunk => chunk.metadata?.title === '一'), 2)
    const second = reconstruct(result.data.filter(chunk => chunk.metadata?.title === '二'), 2)
    expect(first + second).toBe(text)
    expect(result.data.some(chunk => chunk.metadata?.subChunk === true)).toBe(true)
  })

  it('markdown 可显式只移除标题行，其他空白与正文不变', () => {
    const result = datapipe.chunk('## Title\r\n\r\n  Body\t\r\n', { mode: 'markdown', maxSize: 100, overlap: 0, markdownKeepTitle: false })
    expect(result).toMatchObject({ success: true, data: [{ content: '\r\n  Body\t\r\n', metadata: { title: 'Title', level: 2 } }] })
  })

  it.each([0, 1, 2])('custom 零宽/捕获分隔符在 maxSize=%s 的合法部分不死循环或复制文本', (index) => {
    const separator = ['(?=.)', '(\\|+)', '$'][index]!
    const result = datapipe.chunk('😀A|||B  ', { mode: 'custom', maxSize: 2, overlap: 0, separator })
    if (!result.success)
      throw new Error(result.error.message)
    expect(reconstruct(result.data, 0)).toBe('😀A|||B  ')
    expect(result.data.every(chunk => Array.from(chunk.content).length <= 2)).toBe(true)
  })

  it('缺省 overlap=0，显式 overlap 必须严格小于 maxSize', () => {
    expect(ChunkOptionsSchema.parse({ mode: 'character', maxSize: 1 }).overlap).toBe(0)
    for (const overlap of [4, 5, -1, 0.5, Number.POSITIVE_INFINITY])
      expect(datapipe.chunk('content', { mode: 'character', maxSize: 4, overlap })).toMatchObject({ success: false, error: { code: HaiDatapipeError.CONFIG_ERROR.code } })
  })
})
