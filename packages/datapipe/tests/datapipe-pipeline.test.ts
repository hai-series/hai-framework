/**
 * datapipe pipeline 单元测试
 *
 * 覆盖管线构建器的链式调用：clean → transform → chunk → chunkTransform → run。
 */

import { describe, expect, it } from 'vitest'
import { datapipe } from '../src/index.js'

describe('datapipe.pipeline', () => {
  it('clean + chunk 基本管线', async () => {
    const html = '<p>First part.</p>\n\n<p>Second part.</p>'
    const result = await datapipe.pipeline()
      .clean({ removeHtml: true })
      .chunk({ mode: 'paragraph', maxSize: 5000 })
      .run(html)

    expect(result.success).toBe(true)
    expect(result.data!.text).not.toContain('<p>')
    expect(result.data!.chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('clean + transform + chunk', async () => {
    const input = '<b>HELLO WORLD</b>'
    const result = await datapipe.pipeline()
      .clean({ removeHtml: true })
      .transform(text => text.toLowerCase())
      .chunk({ mode: 'sentence', maxSize: 5000 })
      .run(input)

    expect(result.success).toBe(true)
    expect(result.data!.text).toBe('hello world')
    expect(result.data!.chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('chunkTransform 过滤短分块', async () => {
    const text = 'Short.\n\nThis is a longer paragraph that should survive filtering.'
    const result = await datapipe.pipeline()
      .chunk({ mode: 'paragraph', maxSize: 5000 })
      .chunkTransform(chunks => chunks.filter(c => c.content.length > 10))
      .run(text)

    expect(result.success).toBe(true)
    expect(result.data!.chunks.every(c => c.content.length > 10)).toBe(true)
  })

  it('无 chunk 步骤时 chunks 为空', async () => {
    const result = await datapipe.pipeline()
      .clean({ removeHtml: true })
      .run('<p>Hello</p>')

    expect(result.success).toBe(true)
    expect(result.data!.text).toBe('Hello')
    expect(result.data!.chunks).toEqual([])
  })

  it('异步 transform', async () => {
    const result = await datapipe.pipeline()
      .transform(async (text) => {
        // 模拟异步处理
        return text.replace(/foo/g, 'bar')
      })
      .run('foo baz foo')

    expect(result.success).toBe(true)
    expect(result.data!.text).toBe('bar baz bar')
  })

  it('异步 chunkTransform', async () => {
    const result = await datapipe.pipeline()
      .chunk({ mode: 'paragraph', maxSize: 5000 })
      .chunkTransform(async (chunks) => {
        return chunks.map(c => ({ ...c, content: c.content.toUpperCase() }))
      })
      .run('First.\n\nSecond.')

    expect(result.success).toBe(true)
    expect(result.data!.chunks.every(c => c.content === c.content.toUpperCase())).toBe(true)
  })

  it('多步骤管线完整流程', async () => {
    const raw = '  <div>Item 1</div>\n\n<div>Item 2 with http://example.com</div>\n\n<div>Item 3</div>  '
    const result = await datapipe.pipeline()
      .clean({
        removeHtml: true,
        removeUrls: true,
        normalizeWhitespace: true,
        trim: true,
      })
      .transform(text => text.toUpperCase())
      .chunk({ mode: 'paragraph', maxSize: 5000 })
      .chunkTransform(chunks => chunks.filter(c => c.content.length > 0))
      .run(raw)

    expect(result.success).toBe(true)
    expect(result.data!.text).not.toContain('<div>')
    expect(result.data!.text).not.toContain('http://')
    expect(result.data!.chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('clean 出错时管线短路', async () => {
    const result = await datapipe.pipeline()
      .clean({
        customReplacements: [{ pattern: '([invalid', replacement: '' }],
      })
      .chunk({ mode: 'sentence', maxSize: 1000 })
      .run('test')

    // 无效正则应导致 clean 阶段失败
    expect(result.success).toBe(false)
  })

  it('chunk 配置错误时管线短路', async () => {
    const result = await datapipe.pipeline()
      .clean()
      .chunk({ mode: 'custom', maxSize: 1000 })
      .run('test')

    // custom 模式缺少 separator
    expect(result.success).toBe(false)
  })
})
