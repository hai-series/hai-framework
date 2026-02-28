/**
 * =============================================================================
 * @h-ai/reach - 触达服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `reach` 对象，聚合模块生命周期管理。
 *
 * 发送逻辑委托给 reach-send.ts 处理，
 * 数据库操作封装在 reach-repository-send-log.ts 中。
 *
 * @module reach-main
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DbFunctions } from '@h-ai/db'
import type { DndConfig, ProviderConfig, ReachConfig, ReachConfigInput } from './reach-config.js'
import type { SendLogRepository } from './reach-repository-send-log.js'
import type {
  ReachError,
  ReachFunctions,
  ReachMessage,
  ReachProvider,
  ReachTemplateRegistry,
  SendResult,
} from './reach-types.js'

import { core, err, ok } from '@h-ai/core'

import { createAliyunSmsProvider } from './providers/reach-provider-aliyun-sms.js'
import { createApiProvider } from './providers/reach-provider-api.js'
import { createConsoleProvider } from './providers/reach-provider-console.js'
import { createSmtpProvider } from './providers/reach-provider-smtp.js'
import { ReachConfigSchema, ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'
import { createSendLogRepository, resetSendLogRepoSingleton } from './reach-repository-send-log.js'
import { executeSend, resetSendState, startDndScheduler } from './reach-send.js'
import { createTemplateRegistry } from './reach-template.js'

const logger = core.logger.child({ module: 'reach', scope: 'main' })

// =============================================================================
// 内部状态
// =============================================================================

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

// =============================================================================
// Provider 工厂
// =============================================================================

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

// =============================================================================
// DB 动态引用（可选依赖）
// =============================================================================

/**
 * 尝试获取 db 实例（可选依赖，不可用时返回 null）
 */
async function tryGetDb(): Promise<DbFunctions | null> {
  try {
    const dbModuleName = '@h-ai/db'
    const mod = await (import(/* @vite-ignore */ dbModuleName) as Promise<{ db: DbFunctions }>)
    if (!mod.db.isInitialized) {
      return null
    }
    return mod.db
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

// =============================================================================
// 未初始化工具集
// =============================================================================

const notInitialized = core.module.createNotInitializedKit<ReachError>(
  ReachErrorCode.NOT_INITIALIZED,
  () => reachM('reach_notInitialized'),
)

// =============================================================================
// 触达服务对象
// =============================================================================

/**
 * 触达服务对象
 *
 * 统一的用户触达入口，支持同时使用邮件、短信、API 回调等多种 Provider。
 */
export const reach: ReachFunctions = {
  async init(config: ReachConfigInput): Promise<Result<void, ReachError>> {
    if (providers.size > 0) {
      logger.warn('Reach module is already initialized, reinitializing')
      await reach.close()
    }

    logger.info('Initializing reach module')

    try {
      const parsed = ReachConfigSchema.parse(config)
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
          for (const p of newProviders.values()) {
            await p.close()
          }
          return connectResult
        }
        newProviders.set(providerConfig.name, provider)
      }

      providers = newProviders
      currentConfig = parsed
      dndConfig = parsed.dnd

      // 注册配置文件中定义的模板
      if (parsed.templates) {
        templateRegistry.registerMany(parsed.templates)
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
    if (providers.size === 0) {
      currentConfig = null
      dndConfig = undefined
      sendLogRepo = null
      resetSendLogRepoSingleton()
      resetSendState()
      logger.info('Reach module already closed, skipping')
      return
    }

    logger.info('Closing reach module')

    try {
      for (const provider of providers.values()) {
        await provider.close()
      }
      logger.info('Reach module closed')
    }
    catch (error) {
      logger.error('Reach module close failed', { error })
    }
    finally {
      providers = new Map()
      currentConfig = null
      dndConfig = undefined
      templateRegistry = createTemplateRegistry()
      sendLogRepo = null
      resetSendLogRepoSingleton()
      resetSendState()
    }
  },
}
