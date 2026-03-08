/**
 * @h-ai/ai — File 子功能类型
 *
 * 定义文件解析操作的类型接口。
 * @module ai-file-types
 */

import type { Result } from '@h-ai/core'
import type { Buffer } from 'node:buffer'

import type { AIError } from '../ai-types.js'

// ─── 文件解析方法 ───

/**
 * 文件解析方法
 *
 * - `text` — 直接解码为 UTF-8 文本（txt / md / csv / 等文本格式）
 * - `html` — HTML 标签剥除后提取文本
 * - `pdf` — 使用 pdfjs-dist 解析 PDF（需安装可选依赖）
 * - `docx` — 使用 mammoth 解析 Word 文档（需安装可选依赖）
 * - `ocr` — 通过视觉 LLM 进行 OCR 识别（图片及无原生解析器的格式）
 */
export type FileParseMethod = 'text' | 'html' | 'pdf' | 'docx' | 'ocr'

/**
 * 文件解析输出格式
 * - `text` — 纯文本（默认），适合程序处理
 * - `markdown` — Markdown 格式，保留文档结构（标题、列表、粗斜体等），
 *   适用于 HTML、PDF、DOCX；图片 OCR 会提示模型输出 Markdown
 */
export type OutputFormat = 'text' | 'markdown'

// ─── 请求与结果 ───

/**
 * 文件解析选项
 */
export interface FileParseOptions {
  /** 强制使用指定 MIME 类型（覆盖自动检测） */
  mimeType?: string
  /** 强制使用 OCR（即使有原生解析器支持） */
  useOcr?: boolean
  /**
   * OCR 使用的视觉模型（请求级覆盖）
   *
   * 最高优先级，覆盖 `llm.scenarios.ocr` 场景映射。
   * 未指定时通过 `llm.scenarios.ocr` 解析。
   */
  model?: string
  /** OCR 系统提示词（覆盖全局 `file.ocrPrompt` 配置） */
  ocrPrompt?: string
  /** PDF 最大解析页数（默认解析全部页） */
  maxPages?: number
  /**
   * 输出格式（默认 `'text'`）
   */
  outputFormat?: OutputFormat
}

/**
 * 文件解析请求
 */
export interface FileParseRequest {
  /**
   * 文件内容
   *
   * - `Buffer` — 二进制文件（图片、PDF、DOCX 等）
   * - `string` — 文本内容（直接传入文本格式文件）
   */
  content: Buffer | string
  /** 文件名（用于 MIME 类型自动检测，可选） */
  filename?: string
  /** 解析选项 */
  options?: FileParseOptions
}

/**
 * 文件解析结果
 */
export interface FileParseResult {
  /** 提取的文本内容（当 `outputFormat` 为 `'markdown'` 时为 Markdown 格式） */
  text: string
  /** 解析方法 */
  method: FileParseMethod
  /** 页数（PDF 解析时） */
  pageCount?: number
  /** 元数据 */
  metadata?: {
    filename?: string
    mimeType?: string
    charCount?: number
  }
}

// ─── 操作接口 ───

/**
 * File 操作接口（通过 `ai.file` 访问）
 *
 * 需要先调用 `ai.init()` 初始化后使用（OCR 功能需要 LLM 配置）。
 *
 * 支持的格式：
 * - 文本格式（txt、md、csv 等）：直接解码
 * - HTML：剥除标签后提取文本
 * - PDF：使用 pdfjs-dist（需安装），否则回退到 OCR
 * - DOCX：使用 mammoth（需安装），否则回退到 OCR
 * - 图片（JPEG、PNG、GIF、WebP）：通过视觉 LLM OCR 识别
 *
 * @example
 * ```ts
 * import { readFile } from 'node:fs/promises'
 *
 * // 解析 PDF（OCR 模型通过 llm.scenarios.ocr 配置）
 * ai.init({ llm: { apiKey: 'sk-...', scenarios: { ocr: 'gpt-4o' } } })
 *
 * const pdf = await readFile('document.pdf')
 * const result = await ai.file.parse({ content: pdf, filename: 'document.pdf' })
 *
 * // 解析图片（OCR）
 * const image = await readFile('screenshot.png')
 * const result = await ai.file.parse({ content: image, filename: 'screenshot.png' })
 *
 * // 便捷方法：直接获取文本
 * const text = await ai.file.parseText(content, 'document.pdf')
 * ```
 */
export interface FileOperations {
  /**
   * 解析文件内容，提取文本
   *
   * 自动检测文件格式，选择最优解析方法。
   *
   * @param request - 文件解析请求
   * @returns 解析结果，包含文本内容、解析方法和元数据
   */
  parse: (request: FileParseRequest) => Promise<Result<FileParseResult, AIError>>

  /**
   * 便捷方法：直接返回提取的文本字符串
   *
   * @param content - 文件内容（Buffer 或文本字符串）
   * @param filename - 文件名（用于格式检测，可选）
   * @returns 提取的文本内容
   */
  parseText: (content: Buffer | string, filename?: string) => Promise<Result<string, AIError>>
}
