import type { HaiResult } from '@h-ai/core'
import type { DataChunk, PipelineStep } from './datapipe-types.js'
import { ok } from '@h-ai/core'
import { chunkText } from './datapipe-chunk.js'
import { cleanText } from './datapipe-clean.js'

/**
 * 管线中可在线程内连续执行的内置步骤。
 * @example 模块内部上下文
 * ```ts
 * const steps: BuiltinStep[] = [{ type: 'clean', options: { trim: true } }]
 * ```
 */
export type BuiltinStep = Extract<PipelineStep, { type: 'clean' | 'chunk' }>

/**
 * 保留步骤顺序及首次失败。该批次无分块时，由宿主保留上一批的分块。
 * @example 模块内部上下文
 * ```ts
 * const result = runBuiltinSteps([{ type: 'clean' }], ' report ')
 * if (result.success) void result.data.text
 * ```
 */
export function runBuiltinSteps(steps: BuiltinStep[], text: string): HaiResult<{ text: string, chunks?: DataChunk[] }> {
  let chunks: DataChunk[] | undefined
  for (const step of steps) {
    if (step.type === 'clean') {
      const result = cleanText(text, step.options)
      if (!result.success)
        return result
      text = result.data
    }
    else {
      const result = chunkText(text, step.options)
      if (!result.success)
        return result
      chunks = result.data
    }
  }
  return ok({ text, chunks })
}
