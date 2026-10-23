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
 * @example
 * ```ts
 * import { datapipe } from '@h-ai/datapipe'
 * const result = await datapipe.pipeline()
 *   .clean({ removeHtml: true })
 *   .transform(text => text.toLowerCase())
 *   .chunk({ mode: 'character', maxSize: 500, overlap: 50 })
 *   .run('<p>One. Two. Three.</p>')
 * if (result.success) result.data.chunks.map(chunk => chunk.content)
 * else result.error.message
 * ```
 */
export const datapipe: DatapipeFunctions = {
  clean: cleanText,
  chunk: chunkText,
  pipeline: createPipelineBuilder,
}
