/**
 * @h-ai/datapipe — 文本分块功能
 *
 * 提供多种分块模式：句子、段落、Markdown 标题、分页、字数、字符、自定义分隔符。
 * 支持重叠分块以保持上下文衔接。
 * @module datapipe-chunk
 */

import type { Result } from '@h-ai/core'
import type { ChunkMode, ChunkOptionsInput } from './datapipe-config.js'
import type { DataChunk, DatapipeError } from './datapipe-types.js'

import { err, ok } from '@h-ai/core'

import { ChunkOptionsSchema, DatapipeErrorCode } from './datapipe-config.js'
import { datapipeM } from './datapipe-i18n.js'

// ─── 分割函数 ───

/**
 * 按句子分割文本
 *
 * 支持中英文句号、问号、感叹号作为分隔符。
 */
function splitBySentence(text: string): string[] {
  // 匹配中文和英文的句末标点
  const segments = text.split(/(?<=[。！？.!?])\s*/)
  return segments.filter(s => s.trim().length > 0)
}

/**
 * 按段落分割文本
 *
 * 以双换行符作为段落分隔符。
 */
function splitByParagraph(text: string): string[] {
  const segments = text.split(/\n\s*\n/)
  return segments.filter(s => s.trim().length > 0)
}

/**
 * 按 Markdown 标题分割文本
 *
 * 根据最低标题级别（默认 ##），按标题分割为独立的内容块。
 * 每个分块包含标题和其下属内容。
 *
 * @param text - Markdown 文本
 * @param minLevel - 最低标题级别（1-6）
 * @param keepTitle - 是否在分块中保留标题
 * @returns 分块列表（包含元数据：title, level）
 */
function splitByMarkdown(text: string, minLevel: number, keepTitle: boolean): { content: string, title: string, level: number }[] {
  // 构造匹配 minLevel 及以上级别标题的正则
  const headerPattern = new RegExp(`^(#{1,${minLevel}})\\s+(.+)$`, 'gm')

  const sections: { content: string, title: string, level: number }[] = []
  let lastIndex = 0
  let lastTitle = ''
  let lastLevel = 0
  let match: RegExpExecArray | null = null

  // 处理标题前的前置内容
  match = headerPattern.exec(text)
  if (match && match.index > 0) {
    const preContent = text.slice(0, match.index).trim()
    if (preContent.length > 0) {
      sections.push({ content: preContent, title: '', level: 0 })
    }
  }

  // 重置正则
  headerPattern.lastIndex = 0

  // eslint-disable-next-line no-cond-assign
  while ((match = headerPattern.exec(text)) !== null) {
    // 保存上一个分块
    if (lastIndex > 0 || lastTitle) {
      const content = text.slice(lastIndex, match.index).trim()
      if (content.length > 0 || lastTitle) {
        const finalContent = keepTitle && lastTitle
          ? `${'#'.repeat(lastLevel)} ${lastTitle}\n${content}`
          : content
        sections.push({
          content: finalContent.trim(),
          title: lastTitle,
          level: lastLevel,
        })
      }
    }

    lastTitle = match[2].trim()
    lastLevel = match[1].length
    lastIndex = match.index + match[0].length
  }

  // 处理最后一个分块
  if (lastTitle || lastIndex > 0) {
    const content = text.slice(lastIndex).trim()
    const finalContent = keepTitle && lastTitle
      ? `${'#'.repeat(lastLevel)} ${lastTitle}\n${content}`
      : content
    sections.push({
      content: finalContent.trim(),
      title: lastTitle,
      level: lastLevel,
    })
  }

  // 如果没有匹配到任何标题，返回整个文本
  if (sections.length === 0) {
    sections.push({ content: text.trim(), title: '', level: 0 })
  }

  return sections.filter(s => s.content.length > 0)
}

/**
 * 按分页符分割文本
 */
function splitByPage(text: string): string[] {
  const segments = text.split(/\f/)
  return segments.filter(s => s.trim().length > 0)
}

/**
 * 按字数分割文本（中文按字符，英文按空格分词）
 */
function splitByWord(text: string, maxSize: number): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current: string[] = []
  let currentSize = 0

  for (const word of words) {
    if (currentSize + 1 > maxSize && current.length > 0) {
      chunks.push(current.join(' '))
      current = []
      currentSize = 0
    }
    current.push(word)
    currentSize++
  }

  if (current.length > 0) {
    chunks.push(current.join(' '))
  }

  return chunks
}

/**
 * 按字符数分割文本
 */
function splitByCharacter(text: string, maxSize: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += maxSize) {
    chunks.push(text.slice(i, i + maxSize))
  }
  return chunks
}

/**
 * 按自定义分隔符分割文本
 */
function splitByCustom(text: string, separator: string): string[] {
  const regex = new RegExp(separator)
  const segments = text.split(regex)
  return segments.filter(s => s.trim().length > 0)
}

// ─── 分割模式分发 ───

/**
 * 按指定模式分割文本为片段
 */
function splitByMode(
  text: string,
  mode: ChunkMode,
  maxSize: number,
  separator?: string,
  markdownMinLevel?: number,
  markdownKeepTitle?: boolean,
): (string | { content: string, title: string, level: number })[] {
  switch (mode) {
    case 'sentence':
      return splitBySentence(text)
    case 'paragraph':
      return splitByParagraph(text)
    case 'markdown':
      return splitByMarkdown(text, markdownMinLevel ?? 2, markdownKeepTitle ?? true)
    case 'page':
      return splitByPage(text)
    case 'word':
      return splitByWord(text, maxSize)
    case 'character':
      return splitByCharacter(text, maxSize)
    case 'custom':
      return splitByCustom(text, separator ?? '\n')
    default:
      return [text]
  }
}

// ─── 合并分段至分块 ───

/**
 * 将分段合并为不超过 maxSize 的分块，支持重叠
 */
function buildChunks(
  segments: string[],
  maxSize: number,
  overlap: number,
): DataChunk[] {
  const chunks: DataChunk[] = []
  let currentContent = ''
  let chunkIndex = 0

  for (const segment of segments) {
    // 如果当前内容加上新分段超过限制，先保存当前分块
    if (currentContent.length > 0 && currentContent.length + segment.length + 1 > maxSize) {
      chunks.push({
        index: chunkIndex++,
        content: currentContent.trim(),
      })

      // 处理重叠：保留尾部内容
      if (overlap > 0 && currentContent.length > overlap) {
        currentContent = currentContent.slice(-overlap)
      }
      else {
        currentContent = ''
      }
    }

    // 如果单个分段已超过 maxSize，按字符截断
    if (segment.length > maxSize) {
      if (currentContent.length > 0) {
        chunks.push({
          index: chunkIndex++,
          content: currentContent.trim(),
        })
        currentContent = ''
      }

      for (let i = 0; i < segment.length; i += maxSize) {
        const part = segment.slice(i, i + maxSize)
        chunks.push({
          index: chunkIndex++,
          content: part.trim(),
        })
      }
      continue
    }

    currentContent += (currentContent.length > 0 ? '\n' : '') + segment
  }

  // 保存最后一个分块
  if (currentContent.trim().length > 0) {
    chunks.push({
      index: chunkIndex,
      content: currentContent.trim(),
    })
  }

  return chunks
}

// ─── 公共 API ───

/**
 * 对文本进行分块
 *
 * @param text - 输入文本
 * @param options - 分块选项
 * @returns 分块列表
 *
 * @example
 * ```ts
 * // 按 Markdown 标题分块
 * const result = chunkText(markdownText, { mode: 'markdown', maxSize: 2000 })
 *
 * // 按句子分块
 * const result = chunkText(text, { mode: 'sentence', maxSize: 500, overlap: 50 })
 * ```
 */
export function chunkText(text: string, options: ChunkOptionsInput): Result<DataChunk[], DatapipeError> {
  const parseResult = ChunkOptionsSchema.safeParse(options)
  if (!parseResult.success) {
    return err({
      code: DatapipeErrorCode.CONFIG_ERROR,
      message: datapipeM('datapipe_configError', { params: { error: parseResult.error.message } }),
      cause: parseResult.error,
    })
  }

  const opts = parseResult.data

  // 校验 custom 模式需要 separator
  if (opts.mode === 'custom' && !opts.separator) {
    return err({
      code: DatapipeErrorCode.MISSING_SEPARATOR,
      message: datapipeM('datapipe_missingSeparator'),
    })
  }

  if (!text || text.trim().length === 0) {
    return ok([])
  }

  try {
    const segments = splitByMode(
      text,
      opts.mode,
      opts.maxSize,
      opts.separator,
      opts.markdownMinLevel,
      opts.markdownKeepTitle,
    )

    // Markdown 模式：对象形式的分段，带有 title 和 level 元数据
    if (opts.mode === 'markdown') {
      const mdSegments = segments as { content: string, title: string, level: number }[]
      const chunks: DataChunk[] = []

      for (let i = 0; i < mdSegments.length; i++) {
        const segment = mdSegments[i]

        // 如果单个 section 超过 maxSize，进一步拆分
        if (segment.content.length > opts.maxSize) {
          const subChunks = buildChunks([segment.content], opts.maxSize, opts.overlap)
          for (const sub of subChunks) {
            chunks.push({
              index: chunks.length,
              content: sub.content,
              metadata: {
                title: segment.title,
                level: segment.level,
                subChunk: true,
              },
            })
          }
        }
        else {
          chunks.push({
            index: chunks.length,
            content: segment.content,
            metadata: {
              title: segment.title,
              level: segment.level,
            },
          })
        }
      }

      return ok(chunks)
    }

    // 其他模式：字符串形式的分段
    const stringSegments = segments as string[]
    const chunks = buildChunks(stringSegments, opts.maxSize, opts.overlap)

    return ok(chunks)
  }
  catch (error) {
    return err({
      code: DatapipeErrorCode.CHUNK_FAILED,
      message: datapipeM('datapipe_chunkFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}
