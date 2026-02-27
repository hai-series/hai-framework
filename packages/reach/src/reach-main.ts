/**
 * =============================================================================
 * @h-ai/reach - 触达服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `reach` 对象，聚合消息发送和模板管理功能。
 *
 * 支持同时注册多个 Provider，每个 Provider 有唯一名称。
 * 发送时通过 `provider` 字段路由到目标 Provider。
 *
 * 使用方式：
 * 1. 调用 `reach.init()` 初始化（传入多个 Provider 配置）
 * 2. 通过 `reach.template` 注册消息模板（模板绑定 Provider）
 * 3. 通过 `reach.send()` 发送消息（指定 Provider 或从模板自动推导）
 * 4. 调用 `reach.close()` 关闭所有连接
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 *
 * await reach.init({
 *   providers: [
 *     { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'no-reply@example.com' },
 *     { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '...' },
 *     { name: 'webhook', type: 'api', url: 'https://api.example.com/notify' },
 *   ],
 * })
 *
 * reach.template.register({
 *   name: 'welcome',
 *   provider: 'email',
 *   subject: '欢迎 {userName}',
 *   body: '亲爱的 {userName}，欢迎使用我们的服务！',
 * })
 *
 * await reach.send({
 *   provider: 'email',
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   vars: { userName: '张三' },
 * })
 *
 * await reach.close()
 * ```
 *
 * @module reach-main
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ProviderConfig, ReachConfig, ReachConfigInput } from './reach-config.js'
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
import { createTemplateRegistry } from './reach-template.js'

const logger = core.logger.child({ module: 'reach', scope: 'main' })

// =============================================================================
// 内部状态
// =============================================================================

/** 已注册的 Provider 实例（name → Provider） */
let providers: Map<string, ReachProvider> = new Map()

/** 当前配置（未初始化时为 null） */
let currentConfig: ReachConfig | null = null

/** 模板注册表（始终可用） */
let templateRegistry: ReachTemplateRegistry = createTemplateRegistry()

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建对应的 Provider
 *
 * @param config - 已校验的单个 Provider 配置
 * @returns Provider 实例
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
// 未初始化时的占位操作
// =============================================================================

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit<ReachError>(
  ReachErrorCode.NOT_INITIALIZED,
  () => reachM('reach_notInitialized'),
)

// =============================================================================
// 消息预处理（模板渲染 + Provider 路由）
// =============================================================================

/**
 * 预处理消息：如果指定了模板，渲染模板并填充 subject/body，
 * 同时从模板中推导 Provider 名称。
 *
 * @param message - 原始消息
 * @returns 预处理后的消息，或错误
 */
function preprocessMessage(message: ReachMessage): Result<ReachMessage, ReachError> {
  if (!message.template) {
    return ok(message)
  }

  const rendered = templateRegistry.render(message.template, message.vars ?? {})
  if (!rendered.success) {
    return rendered
  }

  // 从模板获取绑定的 Provider（用于路由推导）
  const template = templateRegistry.get(message.template)

  const processed: ReachMessage = {
    ...message,
    provider: message.provider || template?.provider || '',
    subject: message.subject ?? rendered.data.subject,
    body: message.body ?? rendered.data.body,
  }
  return ok(processed)
}

// =============================================================================
// 触达服务对象
// =============================================================================

/**
 * 触达服务对象
 *
 * 统一的用户触达入口，支持同时使用邮件、短信、API 回调等多种 Provider。
 */
export const reach: ReachFunctions = {
  /**
   * 初始化触达模块
   *
   * @param config - 触达配置（包含多个 Provider）
   * @returns 初始化结果
   */
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
          // 回滚已连接的 Provider
          for (const p of newProviders.values()) {
            await p.close()
          }
          return connectResult
        }
        newProviders.set(providerConfig.name, provider)
      }

      providers = newProviders
      currentConfig = parsed
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

  /**
   * 发送触达消息
   *
   * 通过 `provider` 字段路由到目标 Provider。
   * 如果使用模板且未指定 `provider`，从模板绑定的 Provider 推导。
   *
   * @param message - 触达消息
   * @returns 发送结果
   */
  async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
    if (providers.size === 0) {
      return notInitialized.result()
    }

    if (!message.to) {
      return err({
        code: ReachErrorCode.INVALID_RECIPIENT,
        message: reachM('reach_invalidRecipient', { params: { recipient: '' } }),
      })
    }

    const preprocessed = preprocessMessage(message)
    if (!preprocessed.success) {
      return preprocessed
    }

    const providerName = preprocessed.data.provider
    if (!providerName) {
      return err({
        code: ReachErrorCode.PROVIDER_NOT_FOUND,
        message: reachM('reach_providerRequired'),
      })
    }

    const provider = providers.get(providerName)
    if (!provider) {
      return err({
        code: ReachErrorCode.PROVIDER_NOT_FOUND,
        message: reachM('reach_providerNotFound', { params: { provider: providerName } }),
      })
    }

    logger.debug('Sending message', {
      provider: providerName,
      to: preprocessed.data.to,
      template: message.template,
    })

    const result = await provider.send(preprocessed.data)
    if (!result.success) {
      logger.warn('Message send failed', {
        provider: providerName,
        to: message.to,
        error: result.error.code,
      })
    }
    return result
  },

  /** 获取模板注册表 */
  get template(): ReachTemplateRegistry {
    return templateRegistry
  },

  /** 获取当前配置（未初始化时为 null） */
  get config(): ReachConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return providers.size > 0
  },

  /**
   * 关闭所有 Provider 连接
   *
   * 多次调用安全，未初始化时直接返回。
   * 关闭后模板注册表会被重置。
   */
  async close(): Promise<void> {
    if (providers.size === 0) {
      currentConfig = null
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
      throw error
    }
    finally {
      providers = new Map()
      currentConfig = null
      templateRegistry = createTemplateRegistry()
    }
  },
}
