/**
 * @h-ai/datapipe — 数据处理管线配置 Schema
 *
 * 本文件定义数据处理模块的错误码常量、Zod Schema 和配置类型。
 * 支持清洗（clean）、分块（chunk）、转换（transform）和管线（pipeline）。
 * @module datapipe-config
 */

import { z } from 'zod'

// ─── 错误码常量 ───

/**
 * 数据处理错误码（数值范围 8500-8599）
 *
 * @example
 * ```ts
 * import { DatapipeErrorCode } from '@h-ai/datapipe'
 *
 * if (result.error?.code === DatapipeErrorCode.CHUNK_FAILED) {
 *     // 处理错误
 * }
 * ```
 */
export const DatapipeErrorCode = {
  /** 清洗失败 */
  CLEAN_FAILED: 8500,
  /** 分块失败 */
  CHUNK_FAILED: 8501,
  /** 转换失败 */
  TRANSFORM_FAILED: 8502,
  /** 管线执行失败 */
  PIPELINE_FAILED: 8503,
  /** 配置错误 */
  CONFIG_ERROR: 8504,
  /** 输入为空 */
  EMPTY_INPUT: 8505,
  /** 不支持的分块模式 */
  UNSUPPORTED_CHUNK_MODE: 8506,
  /** 自定义分隔符缺失 */
  MISSING_SEPARATOR: 8507,
} as const

/** 数据处理错误码类型 */
export type DatapipeErrorCodeType = typeof DatapipeErrorCode[keyof typeof DatapipeErrorCode]

// ─── 清洗配置 ───

/**
 * 清洗选项 Schema
 *
 * 数据清洗规则配置，支持移除 HTML、URL、Email、标准化空白等。
 *
 * @example
 * ```ts
 * const cleanOptions = {
 *   removeHtml: true,
 *   removeUrls: true,
 *   normalizeWhitespace: true,
 * }
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
  /** 自定义替换规则（正则→替换字符串） */
  customReplacements: z.array(z.object({
    /** 正则表达式字符串 */
    pattern: z.string(),
    /** 替换文本 */
    replacement: z.string(),
  })).optional(),
})

/** 清洗选项类型 */
export type CleanOptions = z.infer<typeof CleanOptionsSchema>

/** 清洗选项输入类型 */
export type CleanOptionsInput = z.input<typeof CleanOptionsSchema>

// ─── 分块配置 ───

/**
 * 分块模式枚举
 *
 * - `sentence` — 按句子分块
 * - `paragraph` — 按段落分块
 * - `markdown` — 按 Markdown 标题分块（## / ### 等）
 * - `page` — 按分页符分块
 * - `word` — 按字数分块
 * - `character` — 按字符数分块
 * - `custom` — 自定义分隔符分块
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

/** 分块模式类型 */
export type ChunkMode = z.infer<typeof ChunkModeSchema>

/**
 * 分块选项 Schema
 *
 * @example
 * ```ts
 * // 按 Markdown 标题分块
 * const chunkOptions = {
 *   mode: 'markdown',
 *   maxSize: 2000,
 *   overlap: 200,
 * }
 *
 * // 按字符分块
 * const chunkOptions = {
 *   mode: 'character',
 *   maxSize: 1000,
 *   overlap: 100,
 * }
 * ```
 */
export const ChunkOptionsSchema = z.object({
  /** 分块模式 */
  mode: ChunkModeSchema,
  /** 每个分块的最大大小（字符数 / 字数，取决于 mode，默认 1000） */
  maxSize: z.number().int().positive().default(1000),
  /** 重叠大小（字符数 / 字数，用于上下文衔接，默认 0） */
  overlap: z.number().int().min(0).default(0),
  /** 自定义分隔符正则（仅 mode='custom' 时使用） */
  separator: z.string().optional(),
  /** Markdown 最低标题级别（1-6，默认 2，即 ## 及以下都作为分块边界） */
  markdownMinLevel: z.number().int().min(1).max(6).default(2),
  /** 是否保留 Markdown 标题在分块内容中（默认 true） */
  markdownKeepTitle: z.boolean().default(true),
})

/** 分块选项类型 */
export type ChunkOptions = z.infer<typeof ChunkOptionsSchema>

/** 分块选项输入类型 */
export type ChunkOptionsInput = z.input<typeof ChunkOptionsSchema>
