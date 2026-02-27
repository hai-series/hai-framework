/**
 * =============================================================================
 * @h-ai/reach - 发送逻辑
 * =============================================================================
 *
 * 本文件封装触达模块的发送逻辑，包括：
 * - 消息预处理（模板渲染 + Provider 路由推导）
 * - DND（免打扰）时间段检查
 * - 消息发送与记录保存
 *
 * @module reach-send
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DndConfig } from './reach-config.js'
import type {
  ReachError,
  ReachMessage,
  ReachProvider,
  ReachTemplateRegistry,
  SendResult,
} from './reach-types.js'

import { core, err, ok } from '@h-ai/core'

import { ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'

const logger = core.logger.child({ module: 'reach', scope: 'send' })

// =============================================================================
// DND（免打扰）检查
// =============================================================================

/**
 * 解析 HH:mm 时间为当天的分钟数（0~1439）
 *
 * @param time - HH:mm 格式的时间字符串
 * @returns 分钟数
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * 检查当前时间是否处于免打扰时段
 *
 * 支持跨午夜时段（如 22:00 → 08:00）。
 *
 * @param dnd - DND 配置
 * @param now - 当前时间（默认 new Date()）
 * @returns 是否被 DND 拦截
 */
export function isDndBlocked(dnd: DndConfig | undefined, now: Date = new Date()): boolean {
  if (!dnd?.enabled) {
    return false
  }

  const startMin = parseTimeToMinutes(dnd.start)
  const endMin = parseTimeToMinutes(dnd.end)
  const currentMin = now.getHours() * 60 + now.getMinutes()

  if (startMin === endMin) {
    return false
  }

  if (startMin < endMin) {
    // 同一天：如 08:00 → 22:00
    return currentMin >= startMin && currentMin < endMin
  }

  // 跨午夜：如 22:00 → 08:00
  return currentMin >= startMin || currentMin < endMin
}

// =============================================================================
// 消息预处理
// =============================================================================

/**
 * 预处理消息：如果指定了模板，渲染模板并填充 subject/body，
 * 同时从模板中推导 Provider 名称。
 *
 * @param message - 原始消息
 * @param templateRegistry - 模板注册表
 * @returns 预处理后的消息，或错误
 */
export function preprocessMessage(
  message: ReachMessage,
  templateRegistry: ReachTemplateRegistry,
): Result<ReachMessage, ReachError> {
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
// 发送记录保存
// =============================================================================

/**
 * 保存发送记录到数据库（如果 db 模块可用）
 *
 * @param message - 发送的消息
 * @param result - 发送结果
 * @param provider - Provider 名称
 */
async function saveSendRecord(
  message: ReachMessage,
  result: SendResult,
  provider: string,
): Promise<void> {
  try {
    // 使用变量阻止 Vite 静态分析，避免 db 未安装时构建失败
    const dbModuleName = '@h-ai/db'
    const mod = await (import(/* @vite-ignore */ dbModuleName) as Promise<{ db: { isInitialized: boolean, ddl: { createTable: (name: string, columns: Record<string, unknown>) => Promise<unknown> }, sql: { execute: (sql: string, params: unknown[]) => Promise<unknown> } } }>)
    const { db } = mod
    if (!db.isInitialized) {
      return
    }

    await db.ddl.createTable('reach_send_log', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      provider: { type: 'TEXT', notNull: true },
      to_addr: { type: 'TEXT', notNull: true },
      subject: { type: 'TEXT' },
      body: { type: 'TEXT' },
      template: { type: 'TEXT' },
      success: { type: 'BOOLEAN', notNull: true },
      message_id: { type: 'TEXT' },
      created_at: { type: 'TIMESTAMP', notNull: true },
    })

    await db.sql.execute(
      `INSERT INTO reach_send_log (provider, to_addr, subject, body, template, success, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider,
        message.to,
        message.subject ?? null,
        message.body ?? null,
        message.template ?? null,
        result.success ? 1 : 0,
        result.messageId ?? null,
        Date.now(),
      ],
    )
  }
  catch {
    // db 模块未安装或不可用时静默忽略
    logger.debug('Send record not saved (db module unavailable)')
  }
}

// =============================================================================
// 发送入口
// =============================================================================

/**
 * 执行消息发送
 *
 * 包含完整的发送流程：
 * 1. 检查初始化状态
 * 2. 校验接收方
 * 3. 预处理消息（模板渲染）
 * 4. 检查 DND 免打扰
 * 5. 路由到目标 Provider
 * 6. 发送消息
 * 7. 保存发送记录
 *
 * @param message - 触达消息
 * @param providers - 已注册的 Provider 实例
 * @param templateRegistry - 模板注册表
 * @param dndConfig - DND 配置
 * @returns 发送结果
 */
export async function executeSend(
  message: ReachMessage,
  providers: Map<string, ReachProvider>,
  templateRegistry: ReachTemplateRegistry,
  dndConfig?: DndConfig,
): Promise<Result<SendResult, ReachError>> {
  if (!message.to) {
    return err({
      code: ReachErrorCode.INVALID_RECIPIENT,
      message: reachM('reach_invalidRecipient', { params: { recipient: '' } }),
    })
  }

  const preprocessed = preprocessMessage(message, templateRegistry)
  if (!preprocessed.success) {
    return preprocessed
  }

  // DND 检查
  if (isDndBlocked(dndConfig)) {
    logger.info('Message blocked by DND', { provider: preprocessed.data.provider, to: message.to })
    return err({
      code: ReachErrorCode.DND_BLOCKED,
      message: reachM('reach_dndBlocked'),
    })
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

  // 异步保存发送记录（不阻塞返回）
  if (result.success) {
    saveSendRecord(message, result.data, providerName).catch(() => {})
  }

  return result
}
