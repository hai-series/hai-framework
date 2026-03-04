/**
 * datapipe-chunk 单元测试
 *
 * 覆盖所有分块模式：sentence / paragraph / markdown / page / word / character / custom
 * 以及重叠、maxSize 超限、边界用例等。
 */

import { describe, expect, it } from 'vitest'
import { datapipe } from '../src/index.js'

describe('datapipe.chunk', () => {
  // ─── 按句子分块 ───

  describe('mode=sentence', () => {
    it('按中文句号分块', () => {
      const result = datapipe.chunk('第一句话。第二句话。第三句话。', { mode: 'sentence', maxSize: 8 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(3)
      expect(result.data![0].content).toContain('第一句话')
    })

    it('按英文句号分块', () => {
      const result = datapipe.chunk('First sentence. Second sentence. Third sentence.', { mode: 'sentence', maxSize: 20 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(3)
    })

    it('混合中英文标点', () => {
      const result = datapipe.chunk('Hello! 你好？World.', { mode: 'sentence', maxSize: 8 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })

    it('大 maxSize 时合并为一块', () => {
      const result = datapipe.chunk('A. B. C.', { mode: 'sentence', maxSize: 5000 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })

    it('小 maxSize 合并句子', () => {
      const result = datapipe.chunk('A. B. C. D. E.', { mode: 'sentence', maxSize: 10 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(1)
      for (const chunk of result.data!) {
        // 允许因合并略微超限，但不应极度超出
        expect(chunk.content.length).toBeLessThanOrEqual(20)
      }
    })
  })

  // ─── 按段落分块 ───

  describe('mode=paragraph', () => {
    it('按双换行分割段落', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.'
      const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 20 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(3)
      expect(result.data![0].content).toContain('Paragraph one')
      expect(result.data![2].content).toContain('Paragraph three')
    })

    it('单段落文本', () => {
      const result = datapipe.chunk('Single paragraph no break.', { mode: 'paragraph', maxSize: 5000 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })

    it('段落重叠', () => {
      const text = 'AAAA\n\nBBBB\n\nCCCC'
      const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 6, overlap: 2 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── 按 Markdown 标题分块 ───

  describe('mode=markdown', () => {
    const markdownText = `# Title

Intro text.

## Section A

Content A.

## Section B

Content B.

### Sub Section B1

Sub content B1.
`

    it('按 ## 级别分块（默认 minLevel=2）', () => {
      const result = datapipe.chunk(markdownText, { mode: 'markdown', maxSize: 5000 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })

    it('保留标题（默认 keepTitle=true）', () => {
      const result = datapipe.chunk(markdownText, { mode: 'markdown', maxSize: 5000 })
      expect(result.success).toBe(true)
      const hasTitle = result.data!.some(c => c.content.startsWith('#'))
      expect(hasTitle).toBe(true)
    })

    it('不保留标题 keepTitle=false', () => {
      const result = datapipe.chunk(markdownText, {
        mode: 'markdown',
        maxSize: 5000,
        markdownKeepTitle: false,
      })
      expect(result.success).toBe(true)
      for (const chunk of result.data!) {
        if (chunk.metadata?.title) {
          expect(chunk.content.startsWith('#')).toBe(false)
        }
      }
    })

    it('markdownMinLevel=1 匹配 # 级标题', () => {
      const result = datapipe.chunk(markdownText, {
        mode: 'markdown',
        maxSize: 5000,
        markdownMinLevel: 1,
      })
      expect(result.success).toBe(true)
      // # Title 级别应作为分块标题
      const h1Chunks = result.data!.filter(c => c.metadata?.level === 1)
      expect(h1Chunks.length).toBeGreaterThanOrEqual(1)
    })

    it('markdownMinLevel=3 匹配到 ### 级标题', () => {
      const result = datapipe.chunk(markdownText, {
        mode: 'markdown',
        maxSize: 5000,
        markdownMinLevel: 3,
      })
      expect(result.success).toBe(true)
      const h3Chunks = result.data!.filter(c => c.metadata?.level === 3)
      expect(h3Chunks.length).toBeGreaterThanOrEqual(1)
    })

    it('分块包含 metadata（title, level）', () => {
      const result = datapipe.chunk(markdownText, { mode: 'markdown', maxSize: 5000 })
      expect(result.success).toBe(true)
      for (const chunk of result.data!) {
        expect(chunk.metadata).toBeDefined()
        expect(chunk.metadata).toHaveProperty('level')
      }
    })

    it('超长 section 自动子分块', () => {
      const longContent = `## Long Section\n${'A'.repeat(3000)}`
      const result = datapipe.chunk(longContent, { mode: 'markdown', maxSize: 500 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThan(1)
      const subChunks = result.data!.filter(c => c.metadata?.subChunk === true)
      expect(subChunks.length).toBeGreaterThan(0)
    })

    it('无标题的 Markdown 整块返回', () => {
      const result = datapipe.chunk('No headers here, just plain text.', { mode: 'markdown', maxSize: 5000 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })
  })

  // ─── 按分页符分块 ───

  describe('mode=page', () => {
    it('按 \\f 分割', () => {
      const text = 'Page 1\fPage 2\fPage 3'
      const result = datapipe.chunk(text, { mode: 'page', maxSize: 8 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(3)
      expect(result.data![0].content).toBe('Page 1')
    })

    it('无分页符返回整块', () => {
      const result = datapipe.chunk('No page break.', { mode: 'page', maxSize: 5000 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })
  })

  // ─── 按字数分块 ───

  describe('mode=word', () => {
    it('按字数切分', () => {
      const text = 'one two three four five six seven eight nine ten'
      const result = datapipe.chunk(text, { mode: 'word', maxSize: 3 })
      expect(result.success).toBe(true)
      // 10词 / 3 = ~4 块
      expect(result.data!.length).toBeGreaterThanOrEqual(3)
    })

    it('单词不足 maxSize 合并为一块', () => {
      const result = datapipe.chunk('hello world', { mode: 'word', maxSize: 100 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
      expect(result.data![0].content).toBe('hello world')
    })
  })

  // ─── 按字符分块 ───

  describe('mode=character', () => {
    it('按字符等分', () => {
      const text = 'ABCDEFGHIJ'
      const result = datapipe.chunk(text, { mode: 'character', maxSize: 3 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(4) // ABC DEF GHI J
      expect(result.data![0].content).toBe('ABC')
      expect(result.data![3].content).toBe('J')
    })

    it('精确匹配时返回一块', () => {
      const result = datapipe.chunk('ABC', { mode: 'character', maxSize: 3 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })
  })

  // ─── 自定义分隔符 ───

  describe('mode=custom', () => {
    it('自定义分隔符分块', () => {
      const result = datapipe.chunk('AAA|||BBB|||CCC', { mode: 'custom', maxSize: 5, separator: '\\|\\|\\|' })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(3)
      expect(result.data![0].content).toBe('AAA')
    })

    it('缺少 separator 报错', () => {
      const result = datapipe.chunk('text', { mode: 'custom', maxSize: 1000 })
      expect(result.success).toBe(false)
      expect(result.error!.code).toBe(8507) // MISSING_SEPARATOR
    })
  })

  // ─── 重叠分块 ───

  describe('overlap', () => {
    it('重叠保留尾部上下文', () => {
      const text = 'Paragraph one is here.\n\nParagraph two is here.\n\nParagraph three is here.'
      const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 30, overlap: 10 })
      expect(result.success).toBe(true)
      // 重叠意味着分块间可能有共享内容
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })

    it('overlap=0 无重叠', () => {
      const text = 'A\n\nB\n\nC\n\nD'
      const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 3, overlap: 0 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── 分块索引 ───

  describe('index', () => {
    it('分块索引从 0 递增', () => {
      const text = 'One.\n\nTwo.\n\nThree.'
      const result = datapipe.chunk(text, { mode: 'paragraph', maxSize: 5000 })
      expect(result.success).toBe(true)
      for (let i = 0; i < result.data!.length; i++) {
        expect(result.data![i].index).toBe(i)
      }
    })
  })

  // ─── 边界用例 ───

  describe('边界用例', () => {
    it('空字符串返回空数组', () => {
      const result = datapipe.chunk('', { mode: 'sentence', maxSize: 1000 })
      expect(result.success).toBe(true)
      expect(result.data!).toEqual([])
    })

    it('纯空白返回空数组', () => {
      const result = datapipe.chunk('   \n\n   ', { mode: 'paragraph', maxSize: 1000 })
      expect(result.success).toBe(true)
      expect(result.data!).toEqual([])
    })

    it('中文分句', () => {
      const result = datapipe.chunk('这是第一句。这是第二句！这是第三句？', { mode: 'sentence', maxSize: 8 })
      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(3)
    })
  })
})
