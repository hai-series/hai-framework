/**
 * @h-ai/reach — 触达服务主入口
 *
 * 本文件提供统一的 `reach` 对象，聚合模块生命周期管理。
 * @module reach-main
 */

import type { Result } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { DndConfig, ProviderConfig, ReachConfig, ReachConfigInput } from './reach-config.js'
import type {
  ReachError,
  ReachFunctions,
  ReachMessage,
  ReachProvider,
  ReachTemplateRegistry,
  SendResult,
} from './reach-types.js'
import type { SendLogRepository } from './repositories/reach-repository-send-log.js'
import type { TemplateRepository } from './repositories/reach-repository-template.js'

import { core, err, ok } from '@h-ai/core'

import { createAliyunSmsProvider } from './providers/reach-provider-aliyun-sms.js'
import { createApiProvider } from './providers/reach-provider-api.js'
import { createConsoleProvider } from './providers/reach-provider-console.js'
import { createSmtpProvider } from './providers/reach-provider-smtp.js'
import { ReachConfigSchema, ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'
import { executeSend, resetSendState, startDndScheduler } from './reach-send.js'
import { createTemplateRegistry } from './reach-template.js'
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
let templateRepo: TemplateRepository | null = null

/** 初始化进行中标志（防止并发调用） */
let initInProgress = false

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的 Provider
 */
function createProvider(config: ProviderConfig): ReachProvider {
  switch (config.type) {
    case 'console':
      return createConsoleProvider()
    case 'smtp':
      return createSmtpProvider()
    case 'aliyun-sms':
      return createAliyunSmsProvider()
    case 'api':
      return createApiProvider()
  }
}

// ─── DB 动态引用（可选依赖） ───

/**
 * 尝试获取 db 实例（可选依赖，不可用时返回 null）
 */
async function tryGetDb(): Promise<ReldbFunctions | null> {
  try {
    const dbModuleName = '@h-ai/reldb'
    const mod = await (import(/* @vite-ignore */ dbModuleName) as Promise<{ reldb: ReldbFunctions }>)
    if (!mod.reldb.isInitialized) {
      return null
    }
    return mod.reldb
  }
  catch {
    return null
  }
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
    logger.debug('Send log repository not initialized', { error: error instanceof Error ? error.message : String(error) })
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
    logger.debug('Template repository not initialized', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

// ─── 未初始化工具集 ───

const notInitialized = core.module.createNotInitializedKit<ReachError>(
  ReachErrorCode.NOT_INITIALIZED,
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

  for (const [name, provider] of providers.entries()) {
    try {
      await provider.close()
    }
    catch (error) {
      logger.error('Provider close failed', { name, error })
    }
  }

  providers = new Map()
  currentConfig = null
  dndConfig = undefined
  templateRegistry = createTemplateRegistry()
  sendLogRepo = null
  templateRepo = null
  resetSendLogRepoSingleton()
  resetTemplateRepoSingleton()
  resetSendState()

  logger.info('Reach module closed')
}

// ─── 初始化逻辑 ───

/**
 * 实际的初始化逻辑（由 init 包裹并发防护后调用）
 */
async function doInit(config: ReachConfigInput): Promise<Result<void, ReachError>> {
  if (providers.size > 0) {
    logger.warn('Reach module is already initialized, reinitializing')
    await doClose()
  }

  logger.info('Initializing reach module')

  const parseResult = ReachConfigSchema.safeParse(config)
  if (!parseResult.success) {
    logger.error('Reach config validation failed', { error: parseResult.error.message })
    return err({
      code: ReachErrorCode.CONFIG_ERROR,
      message: reachM('reach_configError', { params: { error: parseResult.error.message } }),
      cause: parseResult.error,
    })
  }
  const parsed = parseResult.data

  try {
    const newProviders = new Map<string, ReachProvider>()

    for (const providerConfig of parsed.providers) {
      const provider = createProvider(providerConfig)
      const connectResult = await provider.connect(providerConfig)
      if (!connectResult.success) {
        logger.error('Provider initialization failed', {
          name: providerConfig.name,
          type: providerConfig.type,
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        logger.info('Rolling back connected providers', { count: newProviders.size })
        for (const [name, p] of newProviders.entries()) {
          try {
            await p.close()
          }
          catch (rollbackError) {
            logger.error('Provider rollback close failed', { name, error: rollbackError })
          }
        }
        return connectResult
      }
      newProviders.set(providerConfig.name, provider)
    }

    providers = newProviders
    currentConfig = parsed
    dndConfig = parsed.dnd

    // 尝试初始化模板存储
    templateRepo = await tryInitTemplateRepo()

    // 创建模板注册表
    templateRegistry = createTemplateRegistry(templateRepo)

    // 配置文件中定义的模板写入数据库
    if (parsed.templates && templateRepo) {
      const saveResult = await templateRegistry.saveBatch(parsed.templates)
      if (!saveResult.success) {
        logger.warn('Failed to save config templates to database', { error: saveResult.error.message })
      }
    }

    // 尝试初始化发送日志存储
    sendLogRepo = await tryInitSendLogRepo()

    // 启动 DND 恢复定时器
    if (dndConfig) {
      startDndScheduler(dndConfig, providers, sendLogRepo)
    }

    const providerNames = parsed.providers.map(p => p.name)
    logger.info('Reach module initialized', { providers: providerNames })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Reach module initialization failed', { error })
    return err({
      code: ReachErrorCode.CONFIG_ERROR,
      message: reachM('reach_initFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

// ─── 触达服务对象 ───

/**
 * 触达服务对象
 *
 * 统一的用户触达入口，支持同时使用邮件、短信、API 回调等多种 Provider。
 */
export const reach: ReachFunctions = {
  async init(config: ReachConfigInput): Promise<Result<void, ReachError>> {
    if (initInProgress) {
      logger.warn('Reach module init already in progress, skipping')
      return err({
        code: ReachErrorCode.CONFIG_ERROR,
        message: reachM('reach_configError', { params: { error: 'init already in progress' } }),
      })
    }

    initInProgress = true
    try {
      return await doInit(config)
    }
    finally {
      initInProgress = false
    }
  },

  async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
    if (providers.size === 0) {
      return notInitialized.result()
    }

    return executeSend(message, providers, templateRegistry, dndConfig, sendLogRepo)
  },

  get template(): ReachTemplateRegistry {
    return templateRegistry
  },

  get config(): ReachConfig | null {
    return currentConfig
  },

  get isInitialized(): boolean {
    return providers.size > 0
  },

  async close(): Promise<void> {
    await doClose()
  },
}
