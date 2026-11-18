import type { Locale } from '@h-ai/core'
import type { BuiltinStep } from './datapipe-pipeline-builtins.js'
import { parentPort } from 'node:worker_threads'
import { core } from '@h-ai/core'
import { runBuiltinSteps } from './datapipe-pipeline-builtins.js'

/**
 * 连续步骤与该批次处理的完整文本。
 * @example 模块内部上下文
 * ```ts
 * const job: PipelineJob = { locale: 'en-US', steps: [{ type: 'clean' }], text: '<p>Report</p>' }
 * ```
 */
export interface PipelineJob {
  locale: Locale
  steps: BuiltinStep[]
  text: string
}

parentPort?.on('message', ({ steps, text, locale }: PipelineJob) => {
  parentPort?.postMessage(core.i18n.runWithLocale(locale, () => runBuiltinSteps(steps, text)))
})
