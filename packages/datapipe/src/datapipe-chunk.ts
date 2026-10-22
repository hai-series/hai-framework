/**
 * @h-ai/datapipe — 保留源文本的有界分块。
 * word 按非空白词计数，其他模式按 Unicode code point 计数，均先计入 overlap。
 * @module datapipe-chunk
 */
import type { HaiResult } from '@h-ai/core'
import type { ChunkMode, ChunkOptionsInput } from './datapipe-config.js'
import type { DataChunk } from './datapipe-types.js'
import { err, ok } from '@h-ai/core'
import { ChunkOptionsSchema } from './datapipe-config.js'
import { datapipeM } from './datapipe-i18n.js'
import { HaiDatapipeError } from './datapipe-types.js'

/**
 * Markdown 源区间；标题移除仅影响显式 keepTitle=false 的内容起点。
 * @example 模块内部上下文
 * ```ts
 * const section: MarkdownSection = { start: 0, bodyStart: 8, end: 12, title: 'Title', level: 1 }
 * const bodyLength = section.end - section.bodyStart
 * ```
 */
interface MarkdownSection {
  start: number
  bodyStart: number
  end: number
  title: string
  level: number
}

/** 找出自然边界对应的 code point 下标；保留分隔符，不通过 split/join 改写正文。 */
function findBoundaries(text: string, expression?: RegExp): number[] {
  if (!expression)
    return []
  const boundaries: number[] = []
  let previousOffset = 0
  let points = 0
  for (const match of text.matchAll(expression)) {
    const offset = match.index + match[0].length
    if (offset <= previousOffset)
      continue
    points += Array.from(text.slice(previousOffset, offset)).length
    boundaries.push(points)
    previousOffset = offset
  }
  return boundaries
}

/** 取不超过预算的最后自然边界；边界至少越过 overlap，保证下轮起点严格前进。 */
function boundedEnd(boundaries: number[], start: number, limit: number, overlap: number): number {
  let lower = 0
  let upper = boundaries.length
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (boundaries[middle]! <= limit)
      lower = middle + 1
    else
      upper = middle
  }
  const candidate = boundaries[lower - 1]
  return candidate !== undefined && candidate > start + overlap ? candidate : limit
}

/**
 * 所有字符模式共用滑窗；原文切片已包含空白、标点和分隔符，不追加隐式换行。
 * @example splitCharacters('甲😀乙丙丁', 3, 1) // ['甲😀乙', '乙丙丁']
 */
function splitCharacters(text: string, maxSize: number, overlap: number, expression?: RegExp): string[] {
  const points = Array.from(text)
  const boundaries = findBoundaries(text, expression)
  const chunks: string[] = []
  for (let start = 0; start < points.length;) {
    const limit = Math.min(start + maxSize, points.length)
    const end = limit === points.length ? limit : boundedEnd(boundaries, start, limit, overlap)
    chunks.push(points.slice(start, end).join(''))
    if (end === points.length)
      break
    start = end - overlap
  }
  return chunks
}

/** 按非空白词滑窗，切片仍使用原始字符串的 offset，保留词间全部空白。 */
function splitWords(text: string, maxSize: number, overlap: number): string[] {
  const words = [...text.matchAll(/\S+/gu)]
  const chunks: string[] = []
  for (let start = 0; start < words.length;) {
    const end = Math.min(start + maxSize, words.length)
    const from = start === 0 ? 0 : words[start]!.index
    const to = end === words.length ? text.length : words[end]!.index
    chunks.push(text.slice(from, to))
    if (end === words.length)
      break
    start = end - overlap
  }
  return chunks
}

/** 匹配 # 至配置级别的标题；fenced code 内的 # 是正文，不创建虚假 section。 */
function markdownSections(text: string, minLevel: number): MarkdownSection[] {
  const headings: Array<Omit<MarkdownSection, 'end'>> = []
  let fence: { character: string, length: number } | undefined
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    const content = line[0].replace(/\r?\n$/, '')
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(content))
        fence = undefined
      continue
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(content)
    if (opening) {
      fence = { character: opening[1]![0]!, length: opening[1]!.length }
      continue
    }
    const heading = /^ {0,3}(#{1,6})[ \t]/.exec(content)
    if (heading && heading[1]!.length <= minLevel) {
      let title = content.slice(heading[0].length).trim()
      let end = title.length
      while (title[end - 1] === '#')
        end--
      // 只移除空白分隔的尾部 #，按线性扫描处理，避免可交换量词造成正则回溯。
      if (end < title.length && (title[end - 1] === ' ' || title[end - 1] === '\t'))
        title = title.slice(0, end).trimEnd()
      headings.push({ start: line.index, bodyStart: line.index + line[0].length, title, level: heading[1]!.length })
    }
  }
  if (headings.length === 0)
    return [{ start: 0, bodyStart: 0, end: text.length, title: '', level: 0 }]
  const sections: MarkdownSection[] = []
  if (headings[0]!.start > 0)
    sections.push({ start: 0, bodyStart: 0, end: headings[0]!.start, title: '', level: 0 })
  headings.forEach((heading, index) => sections.push({ ...heading, end: headings[index + 1]?.start ?? text.length }))
  return sections
}

/** 自然边界只决定优先切点，不删除分隔符或改变预算单位。 */
function modeExpression(mode: ChunkMode, separator?: string): RegExp | undefined {
  switch (mode) {
    case 'sentence': return /[。！？.!?]+\s*/gu
    case 'paragraph': return /\r?\n(?:[ \t]*\r?\n)+/gu
    case 'page': return /\f/gu
    case 'custom': return new RegExp(separator!, 'gu')
    default: return undefined
  }
}

/**
 * 对文本分块；word 使用词数，其他模式使用 Unicode code point，非字节/token/UTF-16 长度。
 * maxSize 包含 overlap 和分隔符，0 <= overlap < maxSize；默认不重叠。
 * 原始空白与分隔符保留，Markdown 仅在显式 keepTitle=false 时移除标题行。
 * @param text - 源文本；空或全空白输入返回空数组。
 * @param options - 模式与预算；Markdown section 之间不重叠，section 内使用相同边界算法。
 * @returns 有界且顺序连续编号的分块；配置错误或非法正则返回错误结果。
 * @example
 * ```ts
 * import { datapipe } from '@h-ai/datapipe'
 * const result = datapipe.chunk('One. Two. Three.', { mode: 'sentence', maxSize: 12, overlap: 2 })
 * if (result.success) result.data.map(chunk => chunk.content)
 * else result.error.message
 * ```
 */
export function chunkText(text: string, options: ChunkOptionsInput): HaiResult<DataChunk[]> {
  const parsed = ChunkOptionsSchema.safeParse(options)
  if (!parsed.success)
    return err(HaiDatapipeError.CONFIG_ERROR, datapipeM('datapipe_configError', { params: { error: parsed.error.message } }), parsed.error)
  const opts = parsed.data
  if (opts.mode === 'custom' && !opts.separator)
    return err(HaiDatapipeError.MISSING_SEPARATOR, datapipeM('datapipe_missingSeparator'))
  if (!text || text.trim().length === 0)
    return ok([])
  try {
    if (opts.mode === 'markdown') {
      const chunks: DataChunk[] = []
      for (const section of markdownSections(text, opts.markdownMinLevel)) {
        const content = text.slice(opts.markdownKeepTitle ? section.start : section.bodyStart, section.end)
        const parts = splitCharacters(content, opts.maxSize, opts.overlap, modeExpression('paragraph'))
        for (const part of parts)
          chunks.push({ index: chunks.length, content: part, metadata: { title: section.title, level: section.level, ...(parts.length > 1 ? { subChunk: true } : {}) } })
      }
      return ok(chunks)
    }
    const parts = opts.mode === 'word'
      ? splitWords(text, opts.maxSize, opts.overlap)
      : splitCharacters(text, opts.maxSize, opts.overlap, modeExpression(opts.mode, opts.separator))
    return ok(parts.map((content, index) => ({ index, content })))
  }
  catch (cause) {
    return err(HaiDatapipeError.CHUNK_FAILED, datapipeM('datapipe_chunkFailed', { params: { error: String(cause) } }), cause)
  }
}
