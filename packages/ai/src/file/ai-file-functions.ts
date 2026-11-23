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

import type { FileParseJob, FileParseReply } from './ai-file-worker.js'
import { Buffer } from 'node:buffer'

import { Worker } from 'node:worker_threads'
import { core } from '@h-ai/core'

import { resolveModelEntry } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { parseHtmlFile } from './ai-file-html.js'

const parserWorkerUrl = new URL(import.meta.url.endsWith('.ts')
  ? '../../dist/ai-file-worker.js'
  : './ai-file-worker.js', import.meta.url)
const filePool = core.worker.createPool<FileParseJob, FileParseReply>(
  parserWorkerUrl,
  { maxWorkers: 2, maxQueuedJobs: 4, idleTimeoutMs: 15_000 },
)
let activeLocalParsers = 0

async function parseInWorker(job: FileParseJob): Promise<HaiResult<FileParseReply>> {
  const result = await filePool.run(job)
  if (!result.success) {
    return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: { error: result.error.message },
    }), result.error)
  }
  return result
}

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

function asBufferOrText(content: Uint8Array | string): Buffer | string {
  return typeof content === 'string' || Buffer.isBuffer(content)
    ? content
    : Buffer.from(content.buffer, content.byteOffset, content.byteLength)
}

/**
 * 在独立线程中按本地限额解析。可在 AI 初始化前使用。
 * @param request - 文件内容、限额与取消信号
 * @returns 本地解析结果或不含文件原文的失败结果
 * @example 模块内部上下文
 * ```ts
 * const parsed = await parseBoundedLocalFile({ content: '仅供内部使用', filename: 'notes.txt' })
 * if (parsed.success) void parsed.data.text
 * ```
 */
export async function parseBoundedLocalFile(request: FileParseRequest): Promise<HaiResult<FileParseResult>> {
  const { filename, signal, options = {} } = request
  const {
    maxInputBytes = 4 * 1024 * 1024,
    maxPages = 100,
    maxTextLength = 12_000,
    maxZipEntries = 512,
    maxExpandedBytes = 24 * 1024 * 1024,
    timeoutMs = 20_000,
    outputFormat = 'text',
  } = options
  const content = asBufferOrText(request.content)
  const inputBytes = typeof content === 'string'
    ? Buffer.byteLength(content)
    : content.byteLength
  if (options.useOcr || timeoutMs > 0x7FFFFFFF
    || [
      maxInputBytes,
      maxPages,
      maxTextLength,
      maxZipEntries,
      maxExpandedBytes,
      timeoutMs,
    ].some(limit => !Number.isSafeInteger(limit) || limit < 1)
    || !inputBytes || inputBytes > maxInputBytes) {
    return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileLocalInvalid'))
  }
  if (signal?.aborted)
    return core.err(HaiAIError.FILE_LOCAL_CANCELLED, aiM('ai_fileLocalCancelled'))

  const mimeType = detectMimeType(content, filename, options.mimeType)
  const parameters = {
    format: outputFormat,
    locale: core.i18n.getGlobalLocale(),
    limits: { maxTextLength, maxZipEntries, maxExpandedBytes },
  }
  // 复制视图范围，避免 Worker 克隆调用方可能更大的底层 ArrayBuffer。
  const payload = typeof content === 'string'
    ? content
    : Uint8Array.from(content)
  let job: FileParseJob
  if (TEXT_MIME_TYPES.has(mimeType)) {
    job = { ...parameters, type: 'text', content: payload }
  }
  else if (mimeType === 'text/html') {
    job = { ...parameters, type: 'html', content: payload }
  }
  else if (typeof payload !== 'string' && mimeType === 'application/pdf') {
    job = {
      ...parameters,
      type: 'pdf',
      content: payload,
      maxPages,
    }
  }
  else if (typeof payload !== 'string' && mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    job = { ...parameters, type: 'docx', content: payload }
  }
  else {
    return core.err(HaiAIError.FILE_UNSUPPORTED_FORMAT, aiM('ai_fileUnsupportedFormat', {
      params: { mimeType },
    }))
  }

  if (activeLocalParsers >= 3)
    return core.err(HaiAIError.FILE_LOCAL_BUSY, aiM('ai_fileLocalBusy'))
  activeLocalParsers++
  let worker: Worker | undefined
  const deadline = AbortSignal.timeout(timeoutMs)
  const operation = signal
    ? AbortSignal.any([signal, deadline])
    : deadline
  try {
    const thread = new Worker(parserWorkerUrl, {
      resourceLimits: { maxOldGenerationSizeMb: 160 },
    })
    worker = thread
    const parsed = await new Promise<FileParseReply | undefined>((resolve) => {
      const stop = () => finish(undefined)
      function finish(result: FileParseReply | undefined): void {
        operation.removeEventListener('abort', stop)
        resolve(result)
      }
      operation.addEventListener('abort', stop, { once: true })
      thread.once('error', stop)
      thread.once('exit', stop)
      thread.once('message', result => finish(result))
      if (operation.aborted) {
        stop()
      }
      else {
        thread.postMessage(job, typeof payload === 'string'
          ? []
          : [payload.buffer])
      }
    })
    if (signal?.aborted)
      return core.err(HaiAIError.FILE_LOCAL_CANCELLED, aiM('ai_fileLocalCancelled'))
    if (deadline.aborted)
      return core.err(HaiAIError.FILE_LOCAL_TIMEOUT, aiM('ai_fileLocalTimeout'))
    if (!parsed)
      return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileLocalFailed'))
    if (!parsed.success)
      return parsed
    const { text, pageCount, truncated } = parsed.data
    return core.ok({
      text,
      method: job.type,
      ...(pageCount !== undefined && { pageCount }),
      metadata: {
        filename,
        mimeType,
        charCount: text.length,
        ...(truncated && { truncated }),
      },
    })
  }
  catch {
    return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileLocalFailed'))
  }
  finally {
    try {
      await worker?.terminate()
    }
    catch {
      logger.warn('Local file parser worker termination failed')
    }
    activeLocalParsers--
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
    return core.err(HaiAIError.FILE_OCR_FAILED, aiM('ai_fileOcrFailed', {
      params: { error: result.error.message },
    }), result.error)
  }

  return core.ok(result.data.choices[0]?.message?.content ?? '')
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

    return core.ok({
      text: ocrResult.data,
      method: 'ocr' as FileParseMethod,
      metadata: { filename, mimeType, charCount: ocrResult.data.length },
    })
  }

  /**
   * 核心解析逻辑
   */
  async function doParse(request: FileParseRequest): Promise<HaiResult<FileParseResult>> {
    if (request.options?.mode === 'local')
      return parseBoundedLocalFile(request)
    const { filename, options = {} } = request
    const content = asBufferOrText(request.content)
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
        return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'OCR requires Buffer content' },
        }))
      }
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 文本格式：直接解码（markdown 不改变纯文本语义）
    if (TEXT_MIME_TYPES.has(mimeType)) {
      const text = parseTextContent(content)
      return core.ok({
        text,
        method: 'text' as FileParseMethod,
        metadata: { filename, mimeType, charCount: text.length },
      })
    }

    // HTML：按输出格式选择解析方式
    if (mimeType === 'text/html') {
      let text: string
      if (content.length >= 128 * 1024) {
        const result = await parseInWorker({
          type: 'html',
          content,
          format: outputFormat,
          locale: core.i18n.getGlobalLocale(),
        })
        if (!result.success)
          return result
        if (!result.data.success)
          return result.data
        text = result.data.data.text
      }
      else {
        text = parseHtmlFile(parseTextContent(content), outputFormat)
      }
      return core.ok({
        text,
        method: 'html' as FileParseMethod,
        metadata: { filename, mimeType, charCount: text.length },
      })
    }

    // 本地解析器处理 PDF/Office，解析器失败后按原请求回退至 OCR。
    const isPdf = mimeType === 'application/pdf'
    if (
      isPdf || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mimeType === 'application/msword'
      || mimeType === 'application/zip'
    ) {
      if (!Buffer.isBuffer(content)) {
        return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: {
            reason: isPdf ? 'PDF parsing requires Buffer content' : 'DOCX parsing requires Buffer content',
          },
        }))
      }
      const result = await parseInWorker({
        type: isPdf ? 'pdf' : 'docx',
        content,
        format: outputFormat,
        maxPages: options.maxPages,
        locale: core.i18n.getGlobalLocale(),
      })
      if (!result.success)
        return result
      if (result.data.success) {
        const { text, pageCount } = result.data.data
        return core.ok({
          text,
          method: isPdf ? 'pdf' : 'docx',
          ...(isPdf
            ? { pageCount }
            : {}),
          metadata: { filename, mimeType, charCount: text.length },
        })
      }
      logger.warn('Local document parser failed, falling back to OCR', { filename, mimeType })
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 图片格式：OCR
    if (IMAGE_MIME_TYPES.has(mimeType)) {
      if (!Buffer.isBuffer(content)) {
        return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileInvalidContent', {
          params: { reason: 'Image OCR requires Buffer content' },
        }))
      }
      return runOcr(content, mimeType, filename, options.model, outputFormat, options.systemPrompt)
    }

    // 其他格式：不支持
    return core.err(HaiAIError.FILE_UNSUPPORTED_FORMAT, aiM('ai_fileUnsupportedFormat', {
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
        return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
          params: {
            error: String(error),
          },
        }), error)
      }
    },

    async parseText(content: Uint8Array | string, filename?: string): Promise<HaiResult<string>> {
      const result = await this.parse({ content, filename })
      if (!result.success)
        return result
      return core.ok(result.data.text)
    },
  }
}
