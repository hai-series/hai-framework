/**
 * @h-ai/reach — 触达服务主入口
 *
 * 本文件提供统一的 `reach` 对象，聚合模块生命周期管理。
 * @module reach-main
 */

import type { HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { ReachProvider } from './providers/reach-provider-types.js'
import type { DndConfig, ProviderConfig, ReachConfig, ReachConfigInput } from './reach-config.js'
import type { ReachFunctions, ReachGatewayHook, ReachInitOptions, ReachMessage, ReachTemplateRegistry, SendResult } from './reach-types.js'
import type { SendLogRepository } from './repositories/reach-repository-send-log.js'

import type { TemplateRepository } from './repositories/reach-repository-template.js'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

import { createAliyunSmsProvider } from './providers/reach-provider-aliyun-sms.js'
import { createApiProvider } from './providers/reach-provider-api.js'
import { createConsoleProvider } from './providers/reach-provider-console.js'
import { createSmtpProvider } from './providers/reach-provider-smtp.js'
import { reachConfigView } from './reach-config-view.js'
import { ReachConfigSchema } from './reach-config.js'
import { reachM } from './reach-i18n.js'
import { createReachQueueOperations } from './reach-queue-functions.js'
import { executeSend, startDndScheduler, stopDndScheduler } from './reach-send.js'
import { createTemplateRegistry } from './reach-template.js'
import {
  HaiReachError,

} from './reach-types.js'
import { createSendLogRepository, resetSendLogRepoSingleton } from './repositories/reach-repository-send-log.js'
import { createTemplateRepository, resetTemplateRepoSingleton } from './repositories/reach-repository-template.js'

const logger = core.logger.child({ module: 'reach', scope: 'main' })

// ─── 内部状态 ───

/** 已注册的 Provider 实例（name → Provider） */
let providers: Map<string, ReachProvider> = new Map()

/** 当前配置（未初始化时为 null） */
let currentConfig: ReachConfig | null = null

/** DND 配置 */
let dndConfig: DndConfig | undefined

/** 模板注册表（始终可用） */
let templateRegistry: ReachTemplateRegistry = createTemplateRegistry()

/** 发送日志存储（db 可用时初始化） */
let sendLogRepo: SendLogRepository | null = null

/** 模板存储（db 可用时初始化） */

/** 初始化进行中标志（防止并发调用） */
let initInProgress = false
let initCompletion: Promise<HaiResult<void>> | null = null
let closeInProgress: Promise<void> | null = null

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的 Provider
 */
function createProvider(config: ProviderConfig, gatewayHook?: ReachGatewayHook): ReachProvider {
  switch (config.type) {
    case 'console':
      return createConsoleProvider()
    case 'smtp':
      return createSmtpProvider()
    case 'aliyun-sms':
      return createAliyunSmsProvider(gatewayHook)
    case 'api':
      return createApiProvider()
  }
}

// ─── DB 动态引用（可选依赖） ───

/**
 * 尝试获取 db 实例（可选依赖，不可用时返回 null）
 */
async function tryGetDb(): Promise<ReldbFunctions | null> {
  // 与 Repository 的公开静态导入一致，避免 SSR 打包后动态导入得到另一份未初始化单例。
  return reldb.isInitialized ? reldb : null
}

/**
 * 尝试初始化发送日志存储
 */
async function tryInitSendLogRepo(): Promise<SendLogRepository | null> {
  try {
    const db = await tryGetDb()
    if (!db) {
      return null
    }
    const result = await createSendLogRepository(db)
    if (!result.success) {
      logger.debug('Send log repository not initialized', { error: result.error.message })
      return null
    }
    return result.data
  }
  catch (error) {
    logger.debug('Send log repository not initialized', {
      error: error instanceof Error
        ? error.message
        : String(error),
    })
    return null
  }
}

/**
 * 尝试初始化模板存储
 */
async function tryInitTemplateRepo(): Promise<TemplateRepository | null> {
  try {
    const db = await tryGetDb()
    if (!db) {
      return null
    }
    const result = await createTemplateRepository(db)
    if (!result.success) {
      logger.debug('Template repository not initialized', { error: result.error.message })
      return null
    }
    return result.data
  }
  catch (error) {
    logger.debug('Template repository not initialized', {
      error: error instanceof Error
        ? error.message
        : String(error),
    })
    return null
  }
}

// ─── 未初始化工具集 ───

const notInitialized = core.module.createNotInitializedKit(
  HaiReachError.NOT_INITIALIZED,
  () => reachM('reach_notInitialized'),
)

// ─── 关闭逻辑 ───

/**
 * 关闭所有 Provider 并释放资源（内部实现）
 */
async function doClose(): Promise<void> {
  if (providers.size === 0 && currentConfig === null) {
    logger.info('Reach module already closed, skipping')
    return
  }

  logger.info('Closing reach module')

  const closingProviders = providers
  providers = new Map()
  currentConfig = null
  dndConfig = undefined
  templateRegistry = createTemplateRegistry()
  sendLogRepo = null

  await stopDndScheduler()
  for (const [name, provider] of closingProviders.entries()) {
    try {
      await provider.close()
    }
    catch (error) {
      logger.error('Provider close failed', { name, error })
    }
  }

  resetSendLogRepoSingleton()
  resetTemplateRepoSingleton()

  logger.info('Reach module closed')
}

// ─── 初始化逻辑 ───

/**
 * 实际的初始化逻辑（由 init 包裹并发防护后调用）
 */
async function doInit(config: ReachConfigInput, options?: ReachInitOptions): Promise<HaiResult<void>> {
  if (providers.size > 0) {
    logger.warn('Reach module is already initialized, reinitializing')
    await doClose()
  }

  logger.info('Initializing reach module')

  const parseResult = ReachConfigSchema.safeParse(config)
  if (!parseResult.success) {
    logger.error('Reach config validation failed', { error: parseResult.error.message })
    return core.err(
      HaiReachError.CONFIG_ERROR,
      reachM('reach_configError', {
        params: { error: parseResult.error.message },
      }),
      parseResult.error,
    )
  }
  const parsed = parseResult.data
  const gatewayHooks = new Map(Object.entries(options?.gatewayHooks ?? {}))
  for (const [name, hook] of gatewayHooks) {
    if (typeof hook !== 'function' || !parsed.providers.some(provider => provider.name === name && provider.type === 'aliyun-sms' && provider.gateway))
      return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_gatewayHookInvalid'))
  }
  // Console只证明本机日志调用；生产环境不能把它当作真实触达成功。
  if (core.module.requiresSharedState(process.env) && parsed.providers.some(provider => provider.type === 'console'))
    return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_productionProviderRequired'))

  if (parsed.templates?.length && !reldb.isInitialized)
    return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_templatePersistenceRequired'))

  const newProviders = new Map<string, ReachProvider>()
  let published = false
  try {
    // delay 队列是可靠发送前置；连接任何 Provider、发布模块状态前先确认表已就绪。
    let requiredQueue: SendLogRepository | null = null
    if (parsed.dnd?.enabled && parsed.dnd.strategy === 'delay') {
      if (!reldb.isInitialized)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'))
      const queue = await createSendLogRepository(reldb)
      if (!queue.success)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'), queue.error)
      requiredQueue = queue.data
    }

    for (const providerConfig of parsed.providers) {
      const provider = createProvider(providerConfig, gatewayHooks.get(providerConfig.name))
      newProviders.set(providerConfig.name, provider)
      const connectResult = await provider.connect(providerConfig)
      if (!connectResult.success) {
        logger.error('Provider initialization failed', {
          name: providerConfig.name,
          type: providerConfig.type,
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return connectResult
      }
    }

    // 显式模板属于就绪条件，不能把仓库/保存失败降级为可选日志。
    const candidateTemplateRepo = await tryInitTemplateRepo()
    if (parsed.templates?.length && !candidateTemplateRepo)
      return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_templatePersistenceRequired'))
    const candidateRegistry = createTemplateRegistry(candidateTemplateRepo)

    // 配置文件中定义的模板写入数据库
    if (parsed.templates?.length) {
      const saveResult = await candidateRegistry.saveBatch(parsed.templates)
      if (!saveResult.success) {
        logger.warn('Failed to save config templates to database', { errorCode: saveResult.error.code })
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_templatePersistenceRequired'), saveResult.error)
      }
    }

    // delay 使用已验证的必需队列；即时发送的普通日志仍是可选能力。
    const candidateSendLogRepo = requiredQueue ?? await tryInitSendLogRepo()

    providers = newProviders
    currentConfig = parsed
    dndConfig = parsed.dnd
    templateRegistry = candidateRegistry
    sendLogRepo = candidateSendLogRepo
    published = true

    startDndScheduler(dndConfig, providers, sendLogRepo)

    const providerNames = parsed.providers.map(p => p.name)
    logger.info('Reach module initialized', { providers: providerNames })
    return core.ok(undefined)
  }
  catch (error) {
    logger.error('Reach module initialization failed', { error })
    return core.err(
      HaiReachError.CONFIG_ERROR,
      reachM('reach_initFailed', {
        params: {
          error: error instanceof Error
            ? error.message
            : String(error),
        },
      }),
      error,
    )
  }
  finally {
    if (!published) {
      for (const [name, provider] of newProviders) {
        try {
          await provider.close()
        }
        catch {
          logger.error('Candidate provider cleanup failed', { name })
        }
      }
    }
  }
}

// ─── 触达服务对象 ───

/**
 * 邮件/短信/API触达统一入口；先检查init与send的HaiResult，成功后还区分deferred和即时Provider结果。
 * 模板与delay队列使用已初始化数据库，生产共享后端；close停止本地调度/关闭Provider，不撤销已发外部请求。
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
 *     if (!result.success) throw new Error(result.error.message)
 *     if (!result.data.success) throw new Error('Delivery was not accepted')
 *     if (result.data.deferred) {
 *       const queueId = result.data.queueId
 *       // 持久入队成功，尚未证明接收端已完成外部投递。
 *     }
 *     else { const providerMessageId = result.data.messageId }
 *   }
 *   finally {
 *     await reach.close()
 *   }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export const reach: ReachFunctions = {
  queue: createReachQueueOperations(
    () => providers.size > 0,
    () => sendLogRepo,
    notInitialized.result,
  ),
  async init(config: ReachConfigInput, options?: ReachInitOptions): Promise<HaiResult<void>> {
    if (initInProgress || closeInProgress) {
      logger.warn('Reach module init already in progress, skipping')
      return core.err(
        HaiReachError.CONFIG_ERROR,
        reachM('reach_configError', {
          params: { error: 'init already in progress' },
        }),
      )
    }

    initInProgress = true
    try {
      initCompletion = doInit(config, options)
      return await initCompletion
    }
    finally {
      initInProgress = false
      initCompletion = null
    }
  },

  async send(message: ReachMessage): Promise<HaiResult<SendResult>> {
    if (providers.size === 0) {
      return notInitialized.result()
    }

    return executeSend(message, providers, templateRegistry, dndConfig, sendLogRepo, currentConfig!.queue)
  },

  get template(): ReachTemplateRegistry {
    return templateRegistry
  },

  get config(): ReachConfig | null {
    if (!currentConfig)
      return null
    return reachConfigView(currentConfig)
  },

  get isInitialized(): boolean {
    return providers.size > 0
  },

  async close(): Promise<void> {
    if (closeInProgress)
      return closeInProgress
    closeInProgress = (async () => {
      if (initCompletion)
        await initCompletion
      await doClose()
    })()
    try {
      await closeInProgress
    }
    finally {
      closeInProgress = null
    }
  },
}
