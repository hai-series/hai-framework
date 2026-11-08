/**
 * @h-ai/ai — File 子功能实现
 *
 * 支持多格式文件内容提取：文本、HTML、PDF、DOCX 和 OCR 图片识别。
 * @module ai-file-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { AIConfig } from '../ai-config.js'

import type { LLMOperations } from '../llm/ai-llm-types.js'
import type {
  FileOperations,
  FileParseMethod,
  FileParseRequest,
  FileParseResult,
  OutputFormat,
} from './ai-file-types.js'

import { Buffer } from 'node:buffer'

import { core, err, ok } from '@h-ai/core'

import { resolveModelEntry } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { parseHtmlFile } from './ai-file-html.js'

const logger = core.logger.child({ module: 'ai', scope: 'file' })
// ─── MIME 类型与扩展名映射 ───

/** 文本 MIME 类型集合（直接解码） */
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'text/x-yaml',
  'application/yaml',
])

/** 图片 MIME 类型集合（OCR） */
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
])

/** 文件扩展名 → MIME 类型映射 */
const EXT_TO_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/x-yaml',
  yml: 'text/x-yaml',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
}

/** 根据文件内容的 magic bytes 检测 MIME 类型 */
function detectMimeFromMagicBytes(buffer: Buffer): string | undefined {
  if (buffer.length < 4)
    return undefined
  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf'
  }
  // PNG: \x89PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: \xFF\xD8
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    return 'image/jpeg'
  }
  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif'
  }
  // RIFF/WebP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ZIP (DOCX is ZIP-based): PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'application/zip'
  }
  return undefined
}

/**
 * 检测文件 MIME 类型
 *
 * 优先顺序：显式指定 > 文件名扩展名 > magic bytes > 默认 text/plain
 */
function detectMimeType(content: Buffer | string, filename?: string, explicitMime?: string): string {
  if (explicitMime)
    return explicitMime.toLowerCase()

  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext && ext in EXT_TO_MIME) {
      return EXT_TO_MIME[ext]
    }
  }

  if (Buffer.isBuffer(content)) {
    const detected = detectMimeFromMagicBytes(content)
    if (detected)
      return detected
  }

  return 'text/plain'
}

/**
 * 解析文本格式内容（UTF-8 解码）
 */
function parseTextContent(content: Buffer | string): string {
  if (typeof content === 'string')
    return content
  return content.toString('utf-8')
}

/**
 * 使用 pdfjs-dist 解析 PDF 内容
 */
async function parsePdfContent(content: Buffer, outputFormat: OutputFormat = 'text', maxPages?: number): Promise<HaiResult<{ text: string, pageCount: number }>> {
  try {
    const pdfjs = await import(

      // @ts-expect-error — pdfjs-dist is an optional peer dependency
      'pdfjs-dist/legacy/build/pdf.mjs',
    ) as { getDocument: (...args: unknown[]) => { promise: Promise<unknown> } }
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(content),
    })
    const pdf = await loadingTask.promise as {
      numPages: number
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>
    }
    const totalPages = pdf.numPages
    const pagesToProcess = maxPages
      ? Math.min(maxPages, totalPages)
      : totalPages
    const textParts: string[] = []

    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map(item => item.str ?? '')
        .join(' ')
      textParts.push(pageText)
    }

    // markdown 模式用页分隔线区分每页
    const separator = outputFormat === 'markdown'
      ? '\n\n---\n\n'
      : '\n\n'
    return ok({
      text: textParts.join(separator),
      pageCount: totalPages,
    })
  }
  catch (error) {
    return err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}

/**
 * 使用 mammoth 解析 DOCX 内容
 *
 * - `'text'`：使用 `extractRawText` 提取纯文本
 * - `'markdown'`：使用 `convertToHtml` 后转换为 Markdown
 */
async function parseDocxContent(content: Buffer, outputFormat: OutputFormat = 'text'): Promise<HaiResult<string>> {
  try {
    const mammoth = await import(

      // @ts-expect-error — mammoth is an optional peer dependency
      'mammoth',
    ) as {
      extractRawText: (options: unknown) => Promise<{ value: string }>
      convertToHtml: (options: unknown) => Promise<{ value: string }>
    }
    if (outputFormat === 'markdown') {
      const result = await mammoth.convertToHtml({ buffer: content })
      return ok(parseHtmlFile(result.value, 'markdown'))
    }
    const result = await mammoth.extractRawText({ buffer: content })
    return ok(result.value)
  }
  catch (error) {
    return err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}

/**
 * 使用视觉 LLM 进行 OCR 图片识别
 */
async function parseImageWithOcr(
  content: Buffer,
  mimeType: string,
  llmOps: LLMOperations,
  model?: string,
  outputFormat: OutputFormat = 'text',
  customPrompt?: string,
): Promise<HaiResult<string>> {
  const base64 = content.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const defaultPrompt = outputFormat === 'markdown'
    ? 'Please extract all text content from this image as Markdown, preserving document structure (headings, bullet lists, bold/italic). Return only the Markdown without additional commentary.'
    : 'Please extract all text content from this image accurately. Return only the extracted text without any additional commentary.'
  const prompt = customPrompt ?? defaultPrompt

  logger.trace('Running OCR via vision LLM', { mimeType, model })

  const result = await llmOps.chat({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  })

  if (!result.success) {
    return err(HaiAIError.FILE_OCR_FAILED, aiM('ai_fileOcrFailed', {
      params: { error: result.error.message },
    }), result.error)
  }

  return ok(result.data.choices[0]?.message?.content ?? '')
}

/**
 * 创建 File 操作接口
 *
 * @param config - 校验后的 AI 配置
 * @param llmOps - LLM 操作接口（用于 OCR）
 * @returns FileOperations 实例
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function parse(config: AIConfig, llm: LLMOperations) {
 *   const file = createFileOperations(config, llm)
 *   const result = await file.parse({ content: Buffer.from('项目说明'), filename: 'README.txt' })
 *   if (!result.success) return result
 *   return result.data.text
 * }
 * ```
 */
export function createFileOperations(config: AIConfig, llmOps: LLMOperations): FileOperations {
  /**
   * 统一 OCR 执行入口：解析模型配置 → 调用视觉 LLM → 包装结果
   *
   * 调用方负责确保 content 为 Buffer 类型。
   */
  async function runOcr(
    content: Buffer,
    mimeType: string,
    filename: string | undefined,
    model: string | undefined,
    outputFormat: OutputFormat,
    systemPrompt: string | undefined,
  ): Promise<HaiResult<FileParseResult>> {
    const resolvedResult = resolveModelEntry(config.llm, 'ocr', model, {
      missingApiKeyMessage: aiM('ai_configError', {
        params: { error: 'API Key is required for OCR' },
      }),
    })
    if (!resolvedResult.success)
      return resolvedResult

    const ocrResult = await parseImageWithOcr(
      content,
      mimeType,
      llmOps,
      resolvedResult.data.model,
      outputFormat,
      systemPrompt,
    )
    if (!ocrResult.success)
      return ocrResult

    return ok({
      text: ocrResult.data,
      method: 'ocr' as FileParseMethod,
      metadata: { filename, mimeType, charCount: ocrResult.data.length },
    })
  }

  /**
   * 核心解析逻辑
   */
  async function doParse(request: FileParseRequest): Promise<HaiResult<FileParseResult>> {
    const { content, filename, options = {} } = request
    const mimeType = detectMimeType(content, filename, options.mimeType)
    const outputFormat: OutputFormat = options.outputFormat ?? 'text'

    logger.trace('Parsing file', {
      filename,
      mimeType,
      outputFormat,
      useOcr: options.useOcr,
    })

    // 强制 OCR 模式
    if (options.useOcr) {
      if (!Buffer.isBuffer(content)) {
        return err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'OCR requires Buffer content' },
        }))
      }
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 文本格式：直接解码（markdown 不改变纯文本语义）
    if (TEXT_MIME_TYPES.has(mimeType)) {
      const text = parseTextContent(content)
      return ok({
        text,
        method: 'text' as FileParseMethod,
        metadata: { filename, mimeType, charCount: text.length },
      })
    }

    // HTML：按输出格式选择解析方式
    if (mimeType === 'text/html') {
      const text = parseHtmlFile(parseTextContent(content), outputFormat)
      return ok({
        text,
        method: 'html' as FileParseMethod,
        metadata: { filename, mimeType, charCount: text.length },
      })
    }

    // PDF：尝试 pdfjs-dist，失败则回退 OCR
    if (mimeType === 'application/pdf') {
      if (!Buffer.isBuffer(content)) {
        return err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'PDF parsing requires Buffer content' },
        }))
      }
      const pdfResult = await parsePdfContent(content, outputFormat, options.maxPages)
      if (pdfResult.success) {
        return ok({
          text: pdfResult.data.text,
          method: 'pdf' as FileParseMethod,
          pageCount: pdfResult.data.pageCount,
          metadata: { filename, mimeType, charCount: pdfResult.data.text.length },
        })
      }
      logger.warn('PDF native parser failed, falling back to OCR', { filename })
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // DOCX：尝试 mammoth，失败则回退 OCR
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mimeType === 'application/msword'
      || mimeType === 'application/zip'
    ) {
      if (!Buffer.isBuffer(content)) {
        return err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'DOCX parsing requires Buffer content' },
        }))
      }
      const docxResult = await parseDocxContent(content, outputFormat)
      if (docxResult.success) {
        return ok({
          text: docxResult.data,
          method: 'docx' as FileParseMethod,
          metadata: { filename, mimeType, charCount: docxResult.data.length },
        })
      }
      logger.warn('DOCX native parser failed, falling back to OCR', { filename })
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 图片格式：OCR
    if (IMAGE_MIME_TYPES.has(mimeType)) {
      if (!Buffer.isBuffer(content)) {
        return err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'Image OCR requires Buffer content' },
        }))
      }
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 其他格式：不支持
    return err(HaiAIError.FILE_UNSUPPORTED_FORMAT, aiM('ai_fileUnsupportedFormat', {
      params: { mimeType },
    }))
  }

  return {
    async parse(request: FileParseRequest): Promise<HaiResult<FileParseResult>> {
      try {
        return await doParse(request)
      }
      catch (error) {
        logger.error('File parse failed unexpectedly', { filename: request.filename, error })
        return err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
          params: {
            error: String(error),
          },
        }), error)
      }
    },

    async parseText(content: Buffer | string, filename?: string): Promise<HaiResult<string>> {
      const result = await this.parse({ content, filename })
      if (!result.success)
        return result
      return ok(result.data.text)
    },
  }
}
