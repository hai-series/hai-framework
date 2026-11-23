import type { HaiResult } from '@h-ai/core'
import type { OutputFormat } from './ai-file-types.js'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { parseHtmlFile } from './ai-file-html.js'

/**
 * 使用 pdfjs-dist 解析 PDF 内容。
 * @example 模块内部上下文
 * ```ts
 * const pdfResult = await parsePdfContent(new Uint8Array(), 'text', 1)
 * if (pdfResult.success) void pdfResult.data.pageCount
 * ```
 */
export async function parsePdfContent(
  content: Uint8Array,
  outputFormat: OutputFormat = 'text',
  maxPages?: number,
  maxTextLength?: number,
): Promise<HaiResult<{ text: string, pageCount: number, truncated?: boolean }>> {
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const local = maxTextLength !== undefined
    const pdfjsRoot = local
      ? new URL('../../', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'))
      : undefined
    const loadingTask = getDocument({
      data: content,
      ...(pdfjsRoot && {
        cMapUrl: fileURLToPath(new URL('cmaps/', pdfjsRoot)),
        standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', pdfjsRoot)),
        enableXfa: false,
        useSystemFonts: false,
        useWorkerFetch: false,
        useWasm: false,
        stopAtErrors: true,
      }),
    })
    try {
      const pdf = await loadingTask.promise
      const totalPages = pdf.numPages
      const pagesToProcess = maxPages
        ? Math.min(maxPages, totalPages)
        : totalPages
      const separator = outputFormat === 'markdown'
        ? '\n\n---\n\n'
        : '\n\n'
      const textParts: string[] = []
      let textLength = 0

      for (let i = 1; i <= pagesToProcess; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item) => {
          if (!('str' in item))
            return ''
          return local && item.hasEOL
            ? `${item.str}\n`
            : item.str
        }).join(' ')
        textParts.push(pageText)
        textLength += pageText.length + (i === 1
          ? 0
          : separator.length)
        if (local)
          page.cleanup()
        if (maxTextLength !== undefined && textLength > maxTextLength)
          break
      }

      return core.ok({
        text: textParts.join(separator),
        pageCount: totalPages,
        ...(local && (pagesToProcess < totalPages || textLength > maxTextLength)
          ? { truncated: true }
          : {}),
      })
    }
    finally {
      await loadingTask.destroy()
    }
  }
  catch (error) {
    return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
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
 * @example 模块内部上下文
 * ```ts
 * const docxResult = await parseDocxContent(new Uint8Array(), 'markdown')
 * if (docxResult.success) void docxResult.data
 * ```
 */
export async function parseDocxContent(content: Uint8Array, outputFormat: OutputFormat = 'text'): Promise<HaiResult<string>> {
  try {
    const { default: mammoth } = await import('mammoth')
    if (outputFormat === 'markdown') {
      const result = await mammoth.convertToHtml({
        buffer: Buffer.from(content.buffer, content.byteOffset, content.byteLength),
      })
      return core.ok(parseHtmlFile(result.value, 'markdown'))
    }
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(content.buffer, content.byteOffset, content.byteLength),
    })
    return core.ok(result.value)
  }
  catch (error) {
    return core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}
