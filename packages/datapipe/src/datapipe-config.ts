/**
 * @h-ai/datapipe — 数据处理管线配置 Schema
 *
 * 本文件定义数据处理模块的错误码常量、Zod Schema 和配置类型。
 * 支持清洗（clean）、分块（chunk）、转换（transform）和管线（pipeline）。
 * @module datapipe-config
 */

import { z } from 'zod'

// ─── 清洗配置 ───

/**
 * 清洗选项 Schema
 *
 * 数据清洗规则配置，支持移除 HTML、URL、Email、标准化空白等。
 * @example
 * ```ts
 * import { CleanOptionsSchema } from '@h-ai/datapipe'
 * const options = CleanOptionsSchema.parse({ removeHtml: true, removeEmails: true })
 * ```
 */
export const CleanOptionsSchema = z.object({
  /** 移除 HTML 标签（默认 true） */
  removeHtml: z.boolean().default(true),
  /** 移除 URL（默认 false） */
  removeUrls: z.boolean().default(false),
  /** 移除 Email 地址（默认 false） */
  removeEmails: z.boolean().default(false),
  /** 标准化空白字符（多空格→单空格、去掉多余空行，默认 true） */
  normalizeWhitespace: z.boolean().default(true),
  /** 去除首尾空白（默认 true） */
  trim: z.boolean().default(true),
  /**
   * 自定义替换规则（正则→替换字符串）
   *
   * ❗ 安全提示：pattern 会通过 `new RegExp()` 构造，如果其值来源于用户输入，请在调用方先行校验以防止 ReDoS 攻击。
   */
  customReplacements: z.array(z.object({
    /** 正则表达式字符串 */
    pattern: z.string(),
    /** 替换文本 */
    replacement: z.string(),
  })).optional(),
})

/**
 * 清洗选项类型
 * @example
 * ```ts
 * import { CleanOptionsSchema, type CleanOptions } from '@h-ai/datapipe'
 * const options: CleanOptions = CleanOptionsSchema.parse({ removeHtml: true })
 * ```
 */
export type CleanOptions = z.infer<typeof CleanOptionsSchema>

/**
 * 清洗选项输入类型
 * @example
 * ```ts
 * import type { CleanOptionsInput } from '@h-ai/datapipe'
 * const options: CleanOptionsInput = { removeHtml: true, removeUrls: true }
 * ```
 */
export type CleanOptionsInput = z.input<typeof CleanOptionsSchema>

// ─── 分块配置 ───

/**
 * 分块模式枚举
 *
 * - `sentence` — 按句子分块
 * - `paragraph` — 按段落分块
 * - `markdown` — 按 Markdown 标题分块（## / ### 等）
 * - `page` — 按分页符分块
 * - `word` — 按非空白词数分块，不截断单个词
 * - `character` — 按 Unicode code point 分块，不拆代理对
 * - `custom` — 自定义分隔符分块
 * @example
 * ```ts
 * import { ChunkModeSchema } from '@h-ai/datapipe'
 * const mode = ChunkModeSchema.parse('character')
 * ```
 */
export const ChunkModeSchema = z.enum([
  'sentence',
  'paragraph',
  'markdown',
  'page',
  'word',
  'character',
  'custom',
])

/**
 * 分块模式类型
 * @example
 * ```ts
 * import type { ChunkMode } from '@h-ai/datapipe'
 * const options: ChunkMode = 'character'
 * ```
 */
export type ChunkMode = z.infer<typeof ChunkModeSchema>

/**
 * 分块选项 Schema
 * datapipe 的默认 overlap 为 0；消费者可显式提供自己的默认值，例如 AI Knowledge 为 200。
 * @example
 * ```ts
 * import { ChunkOptionsSchema } from '@h-ai/datapipe'
 * const options = ChunkOptionsSchema.parse({ mode: 'markdown', maxSize: 500, overlap: 50 })
 * // maxSize 已包含重叠，overlap 必须小于 maxSize；自定义正则仅来自可信配置。
 * ```
 */
export const ChunkOptionsSchema = z.object({
  /** 分块模式 */
  mode: ChunkModeSchema,
  /** 每块上限包含 overlap/分隔符；word 按非空白词，其他按 Unicode code point，默认 1500。 */
  maxSize: z.number().int().positive().default(1500),
  /** 重叠使用与 maxSize 相同的单位，必须严格小于 maxSize。 */
  overlap: z.number().int().min(0).default(0),
  /**
   * 自定义分隔符正则（仅 mode='custom' 时使用）
   *
   * ❗ 安全提示：separator 会通过 `new RegExp()` 构造，如果其值来源于用户输入，请在调用方先行校验以防止 ReDoS 攻击。
   */
  separator: z.string().optional(),
  /** Markdown 标题分割深度（1-6，默认 2，即 # 和 ## 作为分块边界；设为 3 则 ### 也作为分块边界） */
  markdownMinLevel: z.number().int().min(1).max(6).default(2),
  /** 是否保留 Markdown 标题在分块内容中（默认 true） */
  markdownKeepTitle: z.boolean().default(true),
}).refine(options => options.overlap < options.maxSize, { path: ['overlap'] })

/**
 * 分块选项类型
 * @example
 * ```ts
 * import { ChunkOptionsSchema, type ChunkOptions } from '@h-ai/datapipe'
 * const options: ChunkOptions = ChunkOptionsSchema.parse({ mode: 'character', maxSize: 500 })
 * ```
 */
export type ChunkOptions = z.infer<typeof ChunkOptionsSchema>

/**
 * 分块选项输入类型
 * @example
 * ```ts
 * import type { ChunkOptionsInput } from '@h-ai/datapipe'
 * const options: ChunkOptionsInput = { mode: 'character', maxSize: 500, overlap: 50 }
 * ```
 */
export type ChunkOptionsInput = z.input<typeof ChunkOptionsSchema>
