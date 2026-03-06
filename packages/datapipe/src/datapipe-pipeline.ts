/**
 * @h-ai/datapipe — 管线构建器
 *
 * 提供可组合的管线构建器，支持链式添加清洗、分块、转换步骤后执行。
 * @module datapipe-pipeline
 */

import type { Result } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput } from './datapipe-config.js'
import type {
  ChunkTransformFn,
  DataChunk,
  DatapipeError,
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

/**
 * 创建管线构建器
 *
 * @returns PipelineBuilder 实例，支持链式添加步骤后执行
 */
export function createPipelineBuilder(): PipelineBuilder {
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

    run: (text: string) => runPipeline(steps, text),
  }

  return builder
}

// ─── 管线执行 ───

/**
 * 执行管线步骤
 */
async function runPipeline(
  steps: PipelineStep[],
  text: string,
): Promise<Result<PipelineResult, DatapipeError>> {
  let currentText = text
  let chunks: DataChunk[] = []

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
        try {
          currentText = await step.fn(currentText)
        }
        catch (error) {
          return err({
            code: DatapipeErrorCode.TRANSFORM_FAILED,
            message: datapipeM('datapipe_transformFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        break
      }

      case 'chunkTransform': {
        if (chunks.length > 0) {
          try {
            chunks = await step.fn(chunks)
          }
          catch (error) {
            return err({
              code: DatapipeErrorCode.PIPELINE_FAILED,
              message: datapipeM('datapipe_pipelineFailed', { params: { error: String(error) } }),
              cause: error,
            })
          }
        }
        break
      }
    }
  }

  return ok({ text: currentText, chunks })
}
