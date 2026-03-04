/**
 * @h-ai/datapipe — 数据处理管线主入口
 *
 * 提供统一的 `datapipe` 对象，聚合清洗、分块和管线功能。
 * datapipe 为纯函数模块，无需初始化即可使用。
 * @module datapipe-main
 */

import type { Result } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput } from './datapipe-config.js'
import type {
  ChunkTransformFn,
  DataChunk,
  DatapipeError,
  DatapipeFunctions,
  PipelineBuilder,
  PipelineResult,
  PipelineStep,
  TransformFn,
} from './datapipe-types.js'

import { err, ok } from '@h-ai/core'

import { chunkText } from './datapipe-chunk.js'
import { cleanText } from './datapipe-clean.js'
import { DatapipeErrorCode } from './datapipe-config.js'
import { datapipeM } from './datapipe-i18n.js'

// ─── 管线构建器 ───

/**
 * 创建管线构建器
 *
 * @returns PipelineBuilder 实例，支持链式添加步骤后执行
 */
function createPipelineBuilder(): PipelineBuilder {
  const steps: PipelineStep[] = []

  const builder: PipelineBuilder = {
    clean(options?: CleanOptionsInput): PipelineBuilder {
      steps.push({ type: 'clean', options })
      return builder
    },

    chunk(options: ChunkOptionsInput): PipelineBuilder {
      steps.push({ type: 'chunk', options })
      return builder
    },

    transform(fn: TransformFn): PipelineBuilder {
      steps.push({ type: 'transform', fn })
      return builder
    },

    chunkTransform(fn: ChunkTransformFn): PipelineBuilder {
      steps.push({ type: 'chunkTransform', fn })
      return builder
    },

    async run(text: string): Promise<Result<PipelineResult, DatapipeError>> {
      let currentText = text
      let chunks: DataChunk[] = []

      try {
        for (const step of steps) {
          switch (step.type) {
            case 'clean': {
              const result = cleanText(currentText, step.options)
              if (!result.success)
                return result as Result<never, DatapipeError>
              currentText = result.data
              break
            }

            case 'chunk': {
              const result = chunkText(currentText, step.options)
              if (!result.success)
                return result as Result<never, DatapipeError>
              chunks = result.data
              break
            }

            case 'transform': {
              currentText = await step.fn(currentText)
              break
            }

            case 'chunkTransform': {
              if (chunks.length > 0) {
                chunks = await step.fn(chunks)
              }
              break
            }
          }
        }

        return ok({ text: currentText, chunks })
      }
      catch (error) {
        return err({
          code: DatapipeErrorCode.PIPELINE_FAILED,
          message: datapipeM('datapipe_pipelineFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  return builder
}

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
