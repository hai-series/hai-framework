/**
 * =============================================================================
 * @h-ai/reach - 触达服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `reach` 对象，聚合消息发送和模板管理功能。
 *
 * 使用方式：
 * 1. 调用 `reach.init()` 初始化触达服务
 * 2. 通过 `reach.template` 注册消息模板
 * 3. 通过 `reach.send()` 发送消息
 * 4. 调用 `reach.close()` 关闭连接
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 *
 * // 1. 初始化（SMTP 邮件）
 * await reach.init({
 *   type: 'smtp',
 *   host: 'smtp.example.com',
 *   port: 465,
 *   secure: true,
 *   user: 'noreply@example.com',
 *   pass: 'password',
 *   from: 'noreply@example.com',
 * })
 *
 * // 2. 注册模板
 * reach.template.register({
 *   name: 'welcome',
 *   subject: '欢迎 {userName}',
 *   body: '亲爱的 {userName}，欢迎使用我们的服务！',
 * })
 *
 * // 3. 发送（使用模板）
 * const result = await reach.send({
 *   channel: 'email',
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   vars: { userName: '张三' },
 * })
 *
 * // 4. 关闭
 * await reach.close()
 * ```
 *
 * @module reach-main
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ReachConfig, ReachConfigInput } from './reach-config.js'
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
import { createConsoleProvider } from './providers/reach-provider-console.js'
import { createSmtpProvider } from './providers/reach-provider-smtp.js'
import { ReachConfigSchema, ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'
import { createTemplateRegistry } from './reach-template.js'

const logger = core.logger.child({ module: 'reach', scope: 'main' })

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的 Provider（未初始化时为 null） */
let currentProvider: ReachProvider | null = null

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
 * @param config - 已校验的配置
 * @returns Provider 实例
 */
function createProvider(config: ReachConfig): ReachProvider {
  switch (config.type) {
    case 'console':
      return createConsoleProvider()
    case 'smtp':
      return createSmtpProvider()
    case 'aliyun-sms':
      return createAliyunSmsProvider()
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
// 消息预处理（模板渲染）
// =============================================================================

/**
 * 预处理消息：如果指定了模板，渲染模板并填充 subject/body
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

  const processed: ReachMessage = {
    ...message,
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
 * 统一的用户触达入口，支持邮件和短信发送。
 */
export const reach: ReachFunctions = {
  /**
   * 初始化触达模块
   *
   * @param config - 触达配置
   * @returns 初始化结果
   */
  async init(config: ReachConfigInput): Promise<Result<void, ReachError>> {
    if (currentProvider) {
      logger.warn('Reach module is already initialized, reinitializing')
      await reach.close()
    }

    logger.info('Initializing reach module')

    try {
      const parsed = ReachConfigSchema.parse(config)
      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        logger.error('Reach module initialization failed', {
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      logger.info('Reach module initialized', { type: parsed.type })
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
   * 支持直接发送和模板发送两种方式。
   *
   * @param message - 触达消息
   * @returns 发送结果
   */
  async send(message: ReachMessage): Promise<Result<SendResult, ReachError>> {
    if (!currentProvider) {
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

    logger.debug('Sending message', {
      channel: preprocessed.data.channel,
      to: preprocessed.data.to,
      template: message.template,
    })

    const result = await currentProvider.send(preprocessed.data)
    if (!result.success) {
      logger.warn('Message send failed', {
        channel: message.channel,
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
    return currentProvider !== null && currentProvider.isConnected()
  },

  /**
   * 关闭触达连接
   *
   * 多次调用安全，未初始化时直接返回。
   * 关闭后模板注册表会被重置。
   */
  async close(): Promise<void> {
    if (!currentProvider) {
      currentConfig = null
      logger.info('Reach module already closed, skipping')
      return
    }

    logger.info('Closing reach module')

    try {
      await currentProvider.close()
      logger.info('Reach module closed')
    }
    catch (error) {
      logger.error('Reach module close failed', { error })
      throw error
    }
    finally {
      currentProvider = null
      currentConfig = null
      templateRegistry = createTemplateRegistry()
    }
  },
}
