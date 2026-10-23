/** 内置 reach Provider 共享契约，不属于 package.exports 公共 API。 */
import type { HaiResult } from '@h-ai/core'
import type { ProviderConfig } from '../reach-config.js'
import type { ReachMessage, SendResult } from '../reach-types.js'

/**
 * 内置跨文件Provider契约，不属于包公开API；supportsIdempotency仅声明已验证的接收端持久去重能力。
 * console为无真实外部投递的开发/测试特例，其可重试标志不证明日志持久去重，生产禁止console。
 * connect/send返回HaiResult，close释放Provider自有资源；非幂等投递开始后不能靠租约或abort声称没有外部效果。
 *
 * @example 模块内部上下文
 * ```ts
 * async function connectAndClose(provider: ReachProvider, config: ProviderConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success) return connected
 *   try { return provider.isConnected() }
 *   finally { await provider.close() }
 * }
 * ```
 */
export interface ReachProvider {
  /** Provider 名称 */
  readonly name: string
  /** 外部Provider的true必须按message.idempotencyKey持久去重；console仅标记开发日志可重试，不提供真实投递保证。 */
  readonly supportsIdempotency: boolean
  /**
   * 连接/初始化 Provider
   * @param config - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function connect(provider: ReachProvider, config: ProviderConfig) {
   *   const result = await provider.connect(config)
   *   if (!result.success) throw new Error(result.error.message)
   *   await provider.close()
   * }
   * ```
   */
  connect: (config: ProviderConfig) => Promise<HaiResult<void>>
  /**
   * 发送消息
   * @param message - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function send(provider: ReachProvider, message: ReachMessage) {
   *   const result = await provider.send(message)
   *   if (!result.success) throw new Error(result.error.message)
   *   return result.data
   * }
   * ```
   */
  send: (message: ReachMessage) => Promise<HaiResult<SendResult>>
  /**
   * 关闭连接
   *
   * @example 模块内部上下文
   * ```ts
   * async function close(provider: ReachProvider) { await provider.close() }
   * ```
   */
  close: () => Promise<void>
  /**
   * 是否已连接
   * @returns 直接boolean状态，不是HaiResult。
   *
   * @example 模块内部上下文
   * ```ts
   * function connected(provider: ReachProvider): boolean { return provider.isConnected() }
   * ```
   */
  isConnected: () => boolean
}
