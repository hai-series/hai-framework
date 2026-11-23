/**
 * @h-ai/datapipe — 保留源文本的有界分块。
 * word 按非空白词计数，其他模式按 Unicode code point 计数，均先计入 overlap。
 * @module datapipe-chunk
 */

import type { HaiResult } from '@h-ai/core'
import type { ChunkMode, ChunkOptionsInput } from './datapipe-config.js'
import type { DataChunk } from './datapipe-types.js'
import { core } from '@h-ai/core'
import { ChunkOptionsSchema } from './datapipe-config.js'
import { datapipeConfigError, datapipeM } from './datapipe-i18n.js'
import { HaiDatapipeError } from './datapipe-types.js'

const MAX_CHUNKS = 100_000
const MAX_CHUNK_OUTPUT_CODE_UNITS = 16_777_216

/**
 * 原文的 UTF-16 切片范围，终点不包含在内。
 * @example 模块内部上下文
 * ```ts
 * const range: ChunkRange = [0, 2]
 * const chunk = 'abcd'.slice(...range)
 * ```
 */
type ChunkRange = [start: number, end: number]

function chunkLimitExceeded(): HaiResult<never> {
  return core.err(HaiDatapipeError.CHUNK_LIMIT_EXCEEDED, datapipeM('datapipe_chunkLimitExceeded', {
    params: { maxChunks: MAX_CHUNKS, maxCodeUnits: MAX_CHUNK_OUTPUT_CODE_UNITS },
  }))
}

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

/** 记录每个 code point 起点及文本末尾的 UTF-16 偏移，供原文切片使用。 */
function codePointOffsets(text: string): Uint32Array {
  const offsets = new Uint32Array(text.length + 1)
  let index = 0
  let offset = 0
  for (const point of text) {
    offset += point.length
    offsets[++index] = offset
  }
  return offsets.subarray(0, index + 1)
}

/** 将按 Unicode 匹配得到的自然边界转换为 code point 下标。 */
function findBoundaries(text: string, offsets: Uint32Array, expression?: RegExp): number[] {
  if (!expression)
    return []
  const boundaries: number[] = []
  let point = 0
  for (const match of text.matchAll(expression)) {
    const offset = match.index + match[0].length
    if (offset <= offsets[point]!)
      continue
    while (offsets[point]! < offset)
      point++
    boundaries.push(point)
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
  return candidate !== undefined && candidate > start + overlap
    ? candidate
    : limit
}

/**
 * 所有字符模式共用滑窗，返回原文 UTF-16 范围以便在生成分块前检查总量。
 * @example Array.from(characterRanges('甲😀乙丙丁', 3, 1)) // [[0, 4], [3, 6]]
 */
function* characterRanges(text: string, maxSize: number, overlap: number, expression?: RegExp): Generator<ChunkRange> {
  const offsets = codePointOffsets(text)
  const pointCount = offsets.length - 1
  const boundaries = findBoundaries(text, offsets, expression)
  for (let start = 0; start < pointCount;) {
    const limit = Math.min(start + maxSize, pointCount)
    const end = limit === pointCount
      ? limit
      : boundedEnd(boundaries, start, limit, overlap)
    yield [offsets[start]!, offsets[end]!]
    if (end === pointCount)
      break
    start = end - overlap
  }
}

/** 按非空白词滑窗，切片仍使用原始字符串的 offset，保留词间全部空白。 */
function* wordRanges(text: string, maxSize: number, overlap: number): Generator<ChunkRange> {
  // 空白集合与 u 模式相同，按代码单元扫描可避免超长非 BMP 词触发正则回溯栈限制。
  const words = Array.from(text.matchAll(/\S+/g), match => match.index)
  for (let start = 0; start < words.length;) {
    const end = Math.min(start + maxSize, words.length)
    const from = start === 0
      ? 0
      : words[start]!
    const to = end === words.length
      ? text.length
      : words[end]!
    yield [from, to]
    if (end === words.length)
      break
    start = end - overlap
  }
}

/** 匹配 # 至配置级别的标题；fenced code 内的 # 是正文，不创建虚假 section。 */
function markdownSections(text: string, minLevel: number): MarkdownSection[] {
  const headings: Array<Omit<MarkdownSection, 'end'>> = []
  let fence: { character: string, length: number } | undefined
  for (const line of text.matchAll(/([^\r\n]*)(?:\r\n?|\n|$)/g)) {
    const content = line[1]!
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
      headings.push({
        start: line.index,
        bodyStart: line.index + line[0].length,
        title,
        level: heading[1]!.length,
      })
    }
  }
  if (headings.length === 0) {
    return [
      {
        start: 0,
        bodyStart: 0,
        end: text.length,
        title: '',
        level: 0,
      },
    ]
  }
  const sections: MarkdownSection[] = []
  if (headings[0]!.start > 0) {
    sections.push({
      start: 0,
      bodyStart: 0,
      end: headings[0]!.start,
      title: '',
      level: 0,
    })
  }
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
 * 每次调用最多生成 100,000 块，正文与每块的 Markdown 标题累计最多 16,777,216 个 UTF-16 代码单元。
 * @param text - 源文本；空或全空白输入返回空数组。
 * @param options - 模式与预算；Markdown section 之间不重叠，section 内使用相同边界算法。
 * @returns 有界且顺序连续编号的分块；配置错误、非法正则或超出总量预算时返回错误结果。
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
    return datapipeConfigError(parsed.error)
  const opts = parsed.data
  if (opts.mode === 'custom' && !opts.separator)
    return core.err(HaiDatapipeError.MISSING_SEPARATOR, datapipeM('datapipe_missingSeparator'))
  try {
    const expression = modeExpression(opts.mode === 'markdown'
      ? 'paragraph'
      : opts.mode, opts.separator)
    if (!text || text.trim().length === 0)
      return core.ok([])

    const sections = opts.mode === 'markdown'
      ? markdownSections(text, opts.markdownMinLevel)
      : [undefined]
    const chunks: DataChunk[] = []
    let outputCodeUnits = 0
    for (const section of sections) {
      const source = section
        ? text.slice(opts.markdownKeepTitle ? section.start : section.bodyStart, section.end)
        : text
      const titleLength = section?.title.length ?? 0
      // 每个原文区间至少保留一遍正文，先用下限避免生成一定超限的分割索引。
      if (source.length > MAX_CHUNK_OUTPUT_CODE_UNITS - outputCodeUnits)
        return chunkLimitExceeded()
      const sectionStartIndex = chunks.length
      const ranges = opts.mode === 'word'
        ? wordRanges(source, opts.maxSize, opts.overlap)
        : characterRanges(source, opts.maxSize, opts.overlap, expression)

      for (const [start, end] of ranges) {
        outputCodeUnits += end - start + titleLength
        if (chunks.length >= MAX_CHUNKS || outputCodeUnits > MAX_CHUNK_OUTPUT_CODE_UNITS)
          return chunkLimitExceeded()
        const chunk: DataChunk = {
          index: chunks.length,
          content: source.slice(start, end),
        }
        if (section)
          chunk.metadata = { title: section.title, level: section.level }
        chunks.push(chunk)
      }

      if (section && chunks.length - sectionStartIndex > 1) {
        for (let index = sectionStartIndex; index < chunks.length; index++)
          chunks[index]!.metadata!.subChunk = true
      }
    }
    return core.ok(chunks)
  }
  catch (cause) {
    return core.err(HaiDatapipeError.CHUNK_FAILED, datapipeM('datapipe_chunkFailed', {
      params: {
        error: String(cause),
      },
    }), cause)
  }
}
