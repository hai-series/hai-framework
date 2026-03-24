/**
 * @h-ai/datapipe — 类型定义
 *
 * 本文件定义数据处理模块的核心接口和类型。
 * @module datapipe-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput } from './datapipe-config'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

/**
 * 数据处理错误信息映射（错误码:HTTP状态码）。
 *
 * 完整错误码将自动生成为：`hai:datapipe:NNN`
 */
const DatapipeErrorInfo = {
  CLEAN_FAILED: '001:500',
  CHUNK_FAILED: '002:500',
  TRANSFORM_FAILED: '003:500',
  PIPELINE_FAILED: '004:500',
  CONFIG_ERROR: '005:400',
  MISSING_SEPARATOR: '006:400',
} as const satisfies ErrorInfo

/**
 * Datapipe 模块标准错误定义对象。
 */
export const HaiDatapipeError = core.error.buildHaiErrorsDef('datapipe', DatapipeErrorInfo)

// ─── 数据块 ───

/**
 * 数据块接口
 *
 * 表示经过分块处理后的单个文本片段。
 *
 * @example
 * ```ts
 * const chunk: DataChunk = {
 *   index: 0,
 *   content: '## 简介\n这是文档的第一部分。',
 *   metadata: { title: '简介', level: 2 },
 * }
 * ```
 */
export interface DataChunk {
  /** 分块索引（从 0 开始） */
  index: number
  /** 分块内容 */
  content: string
  /** 分块元数据（可选） */
  metadata?: Record<string, unknown>
}

// ─── 转换函数 ───

/**
 * 转换函数类型
 *
 * 自定义文本后处理函数，可以是同步或异步。
 */
export type TransformFn = (text: string) => string | Promise<string>

/**
 * 分块转换函数类型
 *
 * 对分块列表进行后处理（如过滤、合并等）。
 */
export type ChunkTransformFn = (chunks: DataChunk[]) => DataChunk[] | Promise<DataChunk[]>

// ─── 管线步骤 ───

/**
 * 管线步骤类型
 *
 * 管线由一系列步骤组成，支持清洗、分块和自定义转换。
 */
export type PipelineStep
  = | { type: 'clean', options?: CleanOptionsInput }
    | { type: 'chunk', options: ChunkOptionsInput }
    | { type: 'transform', fn: TransformFn }
    | { type: 'chunkTransform', fn: ChunkTransformFn }

// ─── 管线结果 ───

/**
 * 管线执行结果
 */
export interface PipelineResult {
  /** 处理后的文本（分块前的最终文本） */
  text: string
  /** 分块列表（如果管线包含 chunk 步骤） */
  chunks: DataChunk[]
}

// ─── 操作接口 ───

/**
 * 清洗操作接口
 *
 * 通过 `datapipe.clean()` 调用。
 */
export interface CleanOperations {
  /**
   * 清洗文本
   *
   * @param text - 原始文本
   * @param options - 清洗选项（可选，使用默认值）
   * @returns 清洗后的文本
   */
  (text: string, options?: CleanOptionsInput): HaiResult<string>
}

/**
 * 分块操作接口
 *
 * 通过 `datapipe.chunk()` 调用。
 */
export interface ChunkOperations {
  /**
   * 对文本进行分块
   *
   * @param text - 输入文本
   * @param options - 分块选项
   * @returns 分块列表
   */
  (text: string, options: ChunkOptionsInput): HaiResult<DataChunk[]>
}

/**
 * 管线构建器接口
 *
 * 通过 `datapipe.pipeline()` 创建，链式添加步骤后执行。
 *
 * @example
 * ```ts
 * const result = await datapipe.pipeline()
 *   .clean({ removeHtml: true })
 *   .transform(text => text.toLowerCase())
 *   .chunk({ mode: 'markdown', maxSize: 2000 })
 *   .run('原始文本')
 * ```
 */
export interface PipelineBuilder {
  /** 添加清洗步骤 */
  clean: (options?: CleanOptionsInput) => PipelineBuilder
  /** 添加分块步骤 */
  chunk: (options: ChunkOptionsInput) => PipelineBuilder
  /** 添加文本转换步骤 */
  transform: (fn: TransformFn) => PipelineBuilder
  /** 添加分块后处理步骤 */
  chunkTransform: (fn: ChunkTransformFn) => PipelineBuilder
  /** 执行管线 */
  run: (text: string) => Promise<HaiResult<PipelineResult>>
}

/**
 * 数据处理管线服务接口
 *
 * @example
 * ```ts
 * import { datapipe } from '@h-ai/datapipe'
 *
 * // 直接清洗
 * const cleaned = datapipe.clean('<p>Hello</p>', { removeHtml: true })
 *
 * // 直接分块
 * const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
 *
 * // 管线模式
 * const result = await datapipe.pipeline()
 *   .clean()
 *   .chunk({ mode: 'paragraph' })
 *   .run(text)
 * ```
 */
export interface DatapipeFunctions {
  /** 清洗文本 */
  clean: CleanOperations
  /** 分块文本 */
  chunk: ChunkOperations
  /** 创建管线构建器 */
  pipeline: () => PipelineBuilder
}
