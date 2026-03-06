/**
 * @h-ai/datapipe — 数据处理管线主入口
 *
 * 提供统一的 `datapipe` 对象，聚合清洗、分块和管线功能。
 * datapipe 为纯函数模块，无需初始化即可使用。
 * @module datapipe-main
 */

import type { DatapipeFunctions } from './datapipe-types.js'

import { chunkText } from './datapipe-chunk.js'
import { cleanText } from './datapipe-clean.js'
import { createPipelineBuilder } from './datapipe-pipeline.js'

// ─── 统一服务对象 ───

/**
 * 数据处理管线服务对象
 *
 * 纯函数模块，无需初始化即可使用。
 *
 * @example
 * ```ts
 * import { datapipe } from '@h-ai/datapipe'
 *
 * // 直接清洗
 * const cleaned = datapipe.clean('<p>Hello</p>')
 *
 * // 按 Markdown 标题分块
 * const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
 *
 * // 管线模式
 * const result = await datapipe.pipeline()
 *   .clean({ removeHtml: true, removeUrls: true })
 *   .transform(text => text.toLowerCase())
 *   .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
 *   .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
 *   .run(rawHtml)
 * ```
 */
export const datapipe: DatapipeFunctions = {
  clean: cleanText,
  chunk: chunkText,
  pipeline: createPipelineBuilder,
}
