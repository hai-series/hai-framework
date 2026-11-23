/**
 * @h-ai/datapipe — 管线构建器
 *
 * 提供可组合的管线构建器，支持链式添加清洗、分块、转换步骤后执行。
 * @module datapipe-pipeline
 */

import type { HaiResult } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput } from './datapipe-config.js'
import type { BuiltinStep } from './datapipe-pipeline-builtins.js'
import type { PipelineJob } from './datapipe-pipeline-worker.js'

import type {
  ChunkTransformFn,
  DataChunk,
  PipelineBuilder,
  PipelineResult,
  PipelineStep,
  TransformFn,
} from './datapipe-types.js'
import { core } from '@h-ai/core'
import { datapipeM } from './datapipe-i18n.js'
import { normalizeBuiltinStep, runBuiltinSteps } from './datapipe-pipeline-builtins.js'
import { HaiDatapipeError } from './datapipe-types.js'

const pool = core.worker.createPool<PipelineJob, ReturnType<typeof runBuiltinSteps>>(
  new URL(import.meta.url.endsWith('.ts')
    ? '../dist/datapipe-pipeline-worker.js'
    : './datapipe-pipeline-worker.js', import.meta.url),
  { maxWorkers: 2, maxQueuedJobs: 8, idleTimeoutMs: 30_000 },
)

/**
 * 创建管线构建器
 *
 * @returns PipelineBuilder 实例，支持链式添加步骤后执行
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

    run: (text: string) => runPipeline(steps.slice(), text),
  }

  return builder
}

// ─── 管线执行 ───

/** 在宿主校验可传输选项，由 Worker 执行首次配置错误之前的步骤。 */
async function runInWorker(batch: BuiltinStep[], text: string): Promise<ReturnType<typeof runBuiltinSteps>> {
  const steps: BuiltinStep[] = []
  let invalid: HaiResult<never> | undefined
  for (const step of batch) {
    const normalized = normalizeBuiltinStep(step)
    if (!normalized.success) {
      invalid = normalized
      break
    }
    steps.push(normalized.data)
  }
  if (invalid && steps.length === 0)
    return invalid

  const computed = await pool.run({
    steps,
    text,
    locale: core.i18n.getGlobalLocale(),
  })
  if (!computed.success)
    return core.err(HaiDatapipeError.PIPELINE_FAILED, computed.error.message, computed.error)
  // 配置错误前的步骤仍可产生更早的业务错误。
  return computed.data.success && invalid
    ? invalid
    : computed.data
}

/**
 * 执行管线步骤
 */
async function runPipeline(
  steps: PipelineStep[],
  text: string,
): Promise<HaiResult<PipelineResult>> {
  let currentText = text
  let chunks: DataChunk[] = []

  for (let index = 0; index < steps.length;) {
    const step = steps[index++]
    if (step.type === 'clean' || step.type === 'chunk') {
      const batch: BuiltinStep[] = [step]
      for (; index < steps.length; index++) {
        const next = steps[index]
        if (next.type !== 'clean' && next.type !== 'chunk')
          break
        batch.push(next)
      }

      // 小文本直接计算，避免线程调度和字符串克隆开销。
      // eslint-disable-next-line node/prefer-global/process -- 此模块也可在浏览器直接运行纯计算。
      const result = currentText.length >= 128 * 1024 && globalThis.process?.versions?.node
        ? await runInWorker(batch, currentText)
        : runBuiltinSteps(batch, currentText)
      if (!result.success)
        return result
      currentText = result.data.text
      chunks = result.data.chunks ?? chunks
      continue
    }

    switch (step.type) {
      case 'transform': {
        try {
          currentText = await step.fn(currentText)
        }
        catch (error) {
          return core.err(HaiDatapipeError.TRANSFORM_FAILED, datapipeM('datapipe_transformFailed', {
            params: {
              error: String(error),
            },
          }), error)
        }
        break
      }

      case 'chunkTransform': {
        if (chunks.length > 0) {
          try {
            chunks = await step.fn(chunks)
          }
          catch (error) {
            return core.err(HaiDatapipeError.PIPELINE_FAILED, datapipeM('datapipe_pipelineFailed', {
              params: {
                error: String(error),
              },
            }), error)
          }
        }
        break
      }
    }
  }

  return core.ok({ text: currentText, chunks })
}
