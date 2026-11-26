import type { HaiResult } from '@h-ai/core'
import type { FeedbackConfig } from './feedback-config.js'
import type { FeedbackOperations } from './feedback-functions.js'
import type { FeedbackFunctions } from './feedback-types.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { FeedbackConfigSchema } from './feedback-config.js'
import { createFeedbackOperations } from './feedback-functions.js'
import { feedbackM } from './feedback-i18n.js'
import { FeedbackReportRepository } from './feedback-repository.js'
import { HaiFeedbackError } from './feedback-types.js'

const notInitialized = core.module.createNotInitializedKit(HaiFeedbackError.NOT_INITIALIZED, () => feedbackM('feedback_notInitialized'))
let current: { operations: FeedbackOperations, config: FeedbackConfig } | null = null
let initializing: Promise<HaiResult<void>> | null = null
let closing: Promise<HaiResult<void>> | null = null
const inFlight = new Set<Promise<unknown>>()

function operationFailed() {
  return core.err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
}

async function execute<T>(work: (operations: FeedbackOperations) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  if (!current)
    return notInitialized.result<T>()
  const operations = current.operations
  const call = Promise.resolve().then(() => work(operations))
  inFlight.add(call)
  try {
    const result = await call
    if (!result.success && typeof result.error.code === 'string' && result.error.code.startsWith('hai:reldb:')) {
      core.logger.warn('Feedback database operation failed', { module: 'feedback', errorCode: result.error.code })
      return operationFailed()
    }
    return result
  }
  catch {
    core.logger.error('Unexpected feedback operation failure', { module: 'feedback' })
    return operationFailed()
  }
  finally {
    inFlight.delete(call)
  }
}

/**
 * 用户反馈的服务端入口。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback'
 * // 连接 RelDB 后初始化。
 * const ready = await feedback.init({ appId: 'orders' })
 * if (!ready.success) throw new Error(ready.error.message)
 * ```
 */
export const feedback: FeedbackFunctions = {
  async init(config) {
    if (initializing || closing)
      return core.err(HaiFeedbackError.INIT_IN_PROGRESS, feedbackM('feedback_initInProgress'))
    const parsed = FeedbackConfigSchema.safeParse(config)
    if (!parsed.success || !reldb.isInitialized)
      return core.err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))

    current = null
    initializing = (async () => {
      await Promise.allSettled([...inFlight])
      const repository = new FeedbackReportRepository()
      const ready = await repository.ready()
      if (!ready.success)
        return ready
      if (closing)
        return notInitialized.result<void>()
      current = {
        operations: createFeedbackOperations(repository, parsed.data.appId),
        config: parsed.data,
      }
      core.logger.info('Feedback module initialized', { module: 'feedback', appId: parsed.data.appId })
      return core.ok(undefined)
    })()
    try {
      return await initializing
    }
    catch {
      return operationFailed()
    }
    finally {
      initializing = null
    }
  },

  close() {
    if (closing)
      return closing
    current = null
    closing = (async () => {
      await Promise.allSettled([...inFlight, initializing])
      return core.ok(undefined)
    })().finally(() => { closing = null })
    return closing
  },

  get isInitialized() {
    return current !== null
  },

  get config() {
    return current
      ? { ...current.config }
      : null
  },

  submit: (input, context) => execute(ops => ops.submit(input, context)),
  listMine: (input, context) => execute(ops => ops.listMine(input, context)),
  list: (input, context) => execute(ops => ops.list(input, context)),
  get: (id, context) => execute(ops => ops.get(id, context)),
  listMessages: (input, context) => execute(ops => ops.listMessages(input, context)),
  addMessage: (input, context) => execute(ops => ops.addMessage(input, context)),
  setStatus: (input, context) => execute(ops => ops.setStatus(input, context)),
  getAttachment: (input, context) => execute(ops => ops.getAttachment(input, context)),
}
