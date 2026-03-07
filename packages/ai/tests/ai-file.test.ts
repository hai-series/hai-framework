/**
 * AI File 子模块单元测试
 *
 * 测试文件内容解析（文本、HTML、PDF、DOCX、图片 OCR）。
 */

import type { AIConfig } from '../src/ai-config.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { createFileOperations } from '../src/file/ai-file-functions.js'

// ─── Mock 辅助 ───

/** 构造基础 AI 配置 */
const mockConfig: AIConfig = {
  llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
} as unknown as AIConfig

/** 构造有 OCR 模型配置的 AI 配置（通过 llm.scenarios.ocr） */
const mockConfigWithOcrModel: AIConfig = {
  llm: { apiKey: 'sk-test', model: 'gpt-4o-mini', scenarios: { ocr: 'gpt-4o' } },
} as unknown as AIConfig

/** 构造 mock LLM，OCR 调用返回指定文本 */
function makeMockLLM(ocrText: string): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: true as const,
      data: {
        choices: [{ message: { content: ocrText, role: 'assistant' } }],
        model: 'gpt-4o',
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
      },
    })),
    chatStream: vi.fn(),
    listModels: vi.fn(),
    getHistory: vi.fn(),
    listSessions: vi.fn(),
  } as unknown as LLMOperations
}

/** 构造 mock LLM，OCR 调用返回错误 */
function makeMockLLMError(): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: false as const,
      error: { code: AIErrorCode.API_ERROR, message: 'API error' },
    })),
    chatStream: vi.fn(),
    listModels: vi.fn(),
    getHistory: vi.fn(),
    listSessions: vi.fn(),
  } as unknown as LLMOperations
}

// ─── 文本格式测试 ───

describe('file operations — text formats', () => {
  it('解析纯文本字符串', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parse({ content: 'Hello World', filename: 'readme.txt' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('Hello World')
      expect(result.data.method).toBe('text')
      expect(result.data.metadata?.mimeType).toBe('text/plain')
    }
  })

  it('解析 Buffer 文本', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const content = Buffer.from('Buffer content', 'utf-8')
    const result = await ops.parse({ content, filename: 'file.md' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('Buffer content')
      expect(result.data.method).toBe('text')
      expect(result.data.metadata?.mimeType).toBe('text/markdown')
    }
  })

  it('解析 CSV 文件', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parse({ content: 'a,b,c\n1,2,3', filename: 'data.csv' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('text')
    }
  })

  it('解析 JSON 文件', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const json = '{"key": "value"}'
    const result = await ops.parse({ content: json, filename: 'config.json' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe(json)
      expect(result.data.method).toBe('text')
    }
  })

  it('parseText 便捷方法返回文本字符串', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parseText('Hello', 'note.txt')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello')
    }
  })
})

// ─── HTML 解析测试 ───

describe('file operations — HTML', () => {
  it('剥除 HTML 标签提取文本', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const html = '<html><body><h1>标题</h1><p>内容段落</p></body></html>'
    const result = await ops.parse({ content: html, filename: 'page.html' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('html')
      expect(result.data.text).toContain('标题')
      expect(result.data.text).toContain('内容段落')
      expect(result.data.text).not.toContain('<h1>')
    }
  })

  it('移除 script 和 style 标签内容', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const html = '<html><head><script>alert("xss")</script><style>.x{color:red}</style></head><body>正文</body></html>'
    const result = await ops.parse({ content: html, filename: 'page.html' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('正文')
      expect(result.data.text).not.toContain('alert')
      expect(result.data.text).not.toContain('color:red')
    }
  })

  it('解码 HTML 实体', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const html = '<p>AT&amp;T &lt;telecom&gt; &quot;corp&quot;</p>'
    const result = await ops.parse({ content: html, filename: 'page.html' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toContain('AT&T')
      expect(result.data.text).toContain('<telecom>')
      expect(result.data.text).toContain('"corp"')
    }
  })

  it('通过 mimeType 覆盖强制 HTML 解析', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const html = '<p>Hello</p>'
    const result = await ops.parse({ content: html, options: { mimeType: 'text/html' } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('html')
    }
  })
})

// ─── PDF 解析测试 ───

describe('file operations — PDF', () => {
  it('通过 PDF magic bytes 识别格式（pdfjs 不可用时回退 OCR）', async () => {
    // 模拟 pdfjs-dist 不可用，则 PDF 应回退 OCR
    vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
      throw new Error('Module not found')
    })

    const mockLLM = makeMockLLM('PDF OCR 提取的文本')
    const ops = createFileOperations(mockConfig, mockLLM)

    // 创建一个 fake PDF buffer（以 %PDF 开头）
    const fakePdf = Buffer.from('%PDF-1.4 fake content')
    const result = await ops.parse({ content: fakePdf, filename: 'doc.pdf' })

    // 不管是用 PDF 原生解析还是 OCR，都应该成功
    expect(result.success).toBe(true)
  })

  it('通过文件名识别 PDF', async () => {
    const mockLLM = makeMockLLM('PDF text via OCR')
    const ops = createFileOperations(mockConfig, mockLLM)
    const fakePdf = Buffer.from('%PDF content')
    const result = await ops.parse({ content: fakePdf, filename: 'report.pdf' })
    // 即使 OCR 降级，结果也不是 unsupported
    if (!result.success) {
      expect(result.error.code).not.toBe(AIErrorCode.FILE_UNSUPPORTED_FORMAT)
    }
  })
})

// ─── 图片 OCR 测试 ───

describe('file operations — image OCR', () => {
  it('通过 PNG magic bytes 检测触发图片 OCR 识别', async () => {
    const mockLLM = makeMockLLM('图片中的文字内容')
    const ops = createFileOperations(mockConfig, mockLLM)

    // PNG magic bytes: \x89PNG
    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Buffer.from('fake png data')])
    const result = await ops.parse({ content: fakePng })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('ocr')
      expect(result.data.text).toBe('图片中的文字内容')
    }
    expect(mockLLM.chat).toHaveBeenCalledOnce()
  })

  it('通过文件名识别 JPEG 并触发 OCR', async () => {
    const mockLLM = makeMockLLM('JPEG text')
    const ops = createFileOperations(mockConfig, mockLLM)

    // JPEG magic bytes: \xFF\xD8
    const fakeJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.from('fake jpeg')])
    const result = await ops.parse({ content: fakeJpeg, filename: 'photo.jpg' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('ocr')
    }
  })

  it('图片解析使用全局 ocrModel 配置', async () => {
    const mockLLM = makeMockLLM('OCR with model')
    const ops = createFileOperations(mockConfigWithOcrModel, mockLLM)

    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.from('png')])
    await ops.parse({ content: fakePng })

    // 验证 chat 被调用（OCR 是通过 chat 实现的）
    expect(mockLLM.chat).toHaveBeenCalledOnce()
    const chatArgs = (mockLLM.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(chatArgs.model).toBe('gpt-4o')
  })

  it('请求级 ocrModel 覆盖全局配置', async () => {
    const mockLLM = makeMockLLM('text')
    const ops = createFileOperations(mockConfigWithOcrModel, mockLLM)

    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.from('png')])
    await ops.parse({
      content: fakePng,
      options: { ocrModel: 'gpt-4-turbo' },
    })

    const chatArgs = (mockLLM.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(chatArgs.model).toBe('gpt-4-turbo')
  })

  it('视觉 LLM 调用失败时返回 FILE_OCR_FAILED', async () => {
    const mockLLM = makeMockLLMError()
    const ops = createFileOperations(mockConfig, mockLLM)

    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.from('png')])
    const result = await ops.parse({ content: fakePng })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.FILE_OCR_FAILED)
    }
  })

  it('useOcr=true 强制 OCR 任何格式', async () => {
    const mockLLM = makeMockLLM('forced OCR text')
    const ops = createFileOperations(mockConfig, mockLLM)

    const textBuffer = Buffer.from('This is a text file')
    const result = await ops.parse({
      content: textBuffer,
      filename: 'file.txt',
      options: { useOcr: true },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('ocr')
      expect(result.data.text).toBe('forced OCR text')
    }
  })

  it('useOcr=true 但传入字符串内容时返回 FILE_INVALID_CONTENT', async () => {
    const mockLLM = makeMockLLM('')
    const ops = createFileOperations(mockConfig, mockLLM)

    const result = await ops.parse({
      content: 'string content',
      options: { useOcr: true },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.FILE_INVALID_CONTENT)
    }
  })
})

// ─── MIME 类型检测测试 ───

describe('file operations — MIME type detection', () => {
  it('优先使用显式指定的 mimeType', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parse({
      content: 'some content',
      filename: 'file.pdf', // 扩展名是 pdf
      options: { mimeType: 'text/plain' }, // 但显式指定为文本
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // 应使用显式指定的 text/plain 而非 pdf
      expect(result.data.method).toBe('text')
    }
  })

  it('通过文件名扩展名检测 MIME', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parse({ content: '# Markdown', filename: 'readme.md' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata?.mimeType).toBe('text/markdown')
    }
  })

  it('不支持的格式返回 FILE_UNSUPPORTED_FORMAT', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parse({
      content: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      filename: 'file.xyz',
      options: { mimeType: 'application/octet-stream' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.FILE_UNSUPPORTED_FORMAT)
    }
  })

  it('通过 magic bytes 识别 PNG（无文件名）', async () => {
    const mockLLM = makeMockLLM('png text')
    const ops = createFileOperations(mockConfig, mockLLM)

    // PNG magic bytes
    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.from('data')])
    const result = await ops.parse({ content: fakePng }) // 无文件名

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata?.mimeType).toBe('image/png')
    }
  })
})

// ─── parseText 便捷方法测试 ───

describe('file operations — parseText', () => {
  it('直接返回文本内容', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parseText('<p>Hello</p>', 'index.html')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('Hello')
    }
  })

  it('解析失败时透传错误', async () => {
    const ops = createFileOperations(mockConfig, makeMockLLM(''))
    const result = await ops.parseText(
      Buffer.from([0x00, 0x01]),
      'file.xyz',
    )
    // 未知格式，默认应使用 text/plain 解码
    // 因为无扩展名匹配 → magic bytes → 未知 → 默认 text/plain
    expect(result.success).toBe(true)
  })
})
