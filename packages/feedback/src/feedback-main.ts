import type { FeedbackConfigInput } from './feedback-config.js'
import type { FeedbackRuntime } from './feedback-functions.js'
import type { FeedbackFunctions } from './feedback-types.js'
import { resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { createFeedbackCapture } from './feedback-capture.js'
import { FeedbackConfigSchema } from './feedback-config.js'
import { createFeedbackOperations } from './feedback-functions.js'
import { feedbackM } from './feedback-i18n.js'
import { FeedbackReportRepository } from './feedback-repository.js'
import { HaiFeedbackError } from './feedback-types.js'

const notInitialized = core.module.createNotInitializedKit(HaiFeedbackError.NOT_INITIALIZED, () => feedbackM('feedback_notInitialized'))
const unavailable = notInitialized.proxy<FeedbackRuntime>()
let current: { operations: FeedbackRuntime, capture: ReturnType<typeof createFeedbackCapture>, config: ReturnType<typeof FeedbackConfigSchema.parse> } | null = null
let generation = 0
let initializing = false
const inFlight = new Set<Promise<unknown>>()

/**
 * Feedback 生命周期与公共操作入口；依赖由应用初始化并在 feedback 关闭后释放。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback'
 *
 * // 宿主先初始化 reldb、storage、reach，并在反馈关闭后释放依赖。
 * async function collectFeedback() {
 *   const initialized = await feedback.init({ appId: 'orders', recipients: ['admin@example.test'], adminUrl: 'https://app.example.test/admin/feedback' })
 *   if (!initialized.success) return initialized
 *   try {
 *     return await feedback.submit({ appId: 'orders', submissionId: 'stable-submission' }, { scopeId: 'tenant-1', userId: 'user-1' })
 *   } finally {
 *     await feedback.close()
 *   }
 * }
 * void collectFeedback
 * ```
 */
export const feedback: FeedbackFunctions = {
  async init(config: FeedbackConfigInput) {
    if (initializing)
      return err(HaiFeedbackError.INIT_IN_PROGRESS, feedbackM('feedback_initInProgress'))
    initializing = true
    const epoch = ++generation
    let candidateCapture: ReturnType<typeof createFeedbackCapture> | undefined
    try {
      const parsed = FeedbackConfigSchema.safeParse(config)
      if (!parsed.success)
        return configFailure(parsed.error.issues.map(issue => issue.path.join('.')))
      if (!reldb.isInitialized || !storage.isInitialized)
        return configFailure([!reldb.isInitialized ? 'reldb' : 'storage'])
      if (parsed.data.notificationMode === 'reach') {
        const provider = await import('@h-ai/reach').catch(() => undefined)
        if (!provider)
          return configFailure(['reach'])
        const { reach } = provider
        if (!reach.isInitialized)
          return configFailure(['reach'])
        if (!reach.config?.providers.some(provider => provider.name === parsed.data.notificationProvider))
          return configFailure(['notificationProvider'])
      }
      if (current) {
        const previous = current
        current = null
        await Promise.allSettled([...inFlight])
        await previous.operations.close()
        await previous.capture.close()
      }
      const repository = new FeedbackReportRepository()
      const ready = await repository.ready()
      if (!ready.success)
        return ready
      if (epoch !== generation)
        return notInitialized.result()
      candidateCapture = createFeedbackCapture(parsed.data.appId, parsed.data.envAllowlist, { appVersion: parsed.data.appVersion, buildId: parsed.data.buildId, commit: parsed.data.commit })
      const operations = createFeedbackOperations(repository, parsed.data, candidateCapture)
      if (epoch !== generation) {
        await operations.close()
        await candidateCapture.close()
        return notInitialized.result()
      }
      current = { operations, capture: candidateCapture, config: parsed.data }
      operations.start()
      core.logger.info('Feedback module initialized', { module: 'feedback', appId: parsed.data.appId })
      return ok(undefined)
    }
    catch {
      if (candidateCapture)
        await candidateCapture.close()
      return err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
    }
    finally {
      initializing = false
    }
  },
  async close() {
    generation++
    const previous = current
    current = null
    await Promise.allSettled([...inFlight])
    if (!previous)
      return ok(undefined)
    try {
      await previous.operations.close()
      await previous.capture.close()
      return ok(undefined)
    }
    catch {
      return err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
    }
  },
  get isInitialized() {
    return current !== null
  },
  get config() {
    return current ? { ...current.config, recipients: [...current.config.recipients], envAllowlist: [...current.config.envAllowlist] } : null
  },
  get budget() {
    return resolveFeedbackBudget(current?.config)
  },
  submit: (input, actor) => guarded(() => (current?.operations ?? unavailable).submit(input, actor)),
  list: (input, actor) => guarded(() => (current?.operations ?? unavailable).list(input, actor)),
  get: (id, actor) => guarded(() => (current?.operations ?? unavailable).get(id, actor)),
  getEvidence: (input, actor) => guarded(() => (current?.operations ?? unavailable).getEvidence(input, actor)),
  setStatus: (input, actor) => guarded(() => (current?.operations ?? unavailable).setStatus(input, actor)),
  appendEvidence: (input, actor) => guarded(() => (current?.operations ?? unavailable).appendEvidence(input, actor)),
  completeCollection: (input, actor) => guarded(() => (current?.operations ?? unavailable).completeCollection(input, actor)),
  uploadAttachment: (input, actor) => guarded(() => (current?.operations ?? unavailable).uploadAttachment(input, actor)),
  getAttachment: (input, actor) => guarded(() => (current?.operations ?? unavailable).getAttachment(input, actor)),
  retry: (input, actor) => guarded(() => (current?.operations ?? unavailable).retry(input, actor)),
  export: (input, actor) => guarded(() => (current?.operations ?? unavailable).export(input, actor)),
  getExport: (input, actor) => guarded(() => (current?.operations ?? unavailable).getExport(input, actor)),
  runJobs: () => guarded(() => (current?.operations ?? unavailable).runJobs()),
}

function configFailure(fields: string[]) {
  return { success: false as const, error: { ...HaiFeedbackError.CONFIG_ERROR, message: feedbackM('feedback_configError'), ext: { module: 'feedback', fields } } }
}

async function guarded<T>(work: () => Promise<import('@h-ai/core').HaiResult<T>>) {
  const promise = core.context.run({ suppressLogObservers: true }, work)
  inFlight.add(promise)
  try {
    return await promise
  }
  catch {
    return err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
  }
  finally {
    inFlight.delete(promise)
  }
}
