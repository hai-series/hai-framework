/** 内置 reach Provider 共享契约，不属于 package.exports 公共 API。 */
import type { HaiResult } from '@h-ai/core'
import type { ProviderConfig } from '../reach-config.js'
import type { ReachMessage, SendResult } from '../reach-types.js'

/**
 * 触达 Provider 接口
 *
 * 由具体实现（console / smtp / aliyun-sms / api）提供。
 * @internal
 * @example
 * ```ts
 * // 模块内部上下文：由内置适配器工厂交付 provider，由模块入口传入已校验配置。
 * async function connectAndClose(provider: ReachProvider, config: ProviderConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success)
 *     return connected
 *   const active = provider.isConnected()
 *   await provider.close()
 *   return active
 * }
 * ```
 */
export interface ReachProvider {
  /** Provider 名称 */
  readonly name: string
  /** 是否具备接收端幂等保障；true 时必须按 message.idempotencyKey 对副作用持久化去重。 */
  readonly supportsIdempotency: boolean
  /** 连接/初始化 Provider */
  connect: (config: ProviderConfig) => Promise<HaiResult<void>>
  /** 发送消息 */
  send: (message: ReachMessage) => Promise<HaiResult<SendResult>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
}
