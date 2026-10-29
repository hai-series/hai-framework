/** 服务端配置快照；SSR 调用方只投影公开传输参数，不能返回完整对象。 */
import type { KitConfig } from '@h-ai/kit'
import { resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { FeedbackConfigSchema } from '@h-ai/feedback'
import { KitConfigSchema } from '@h-ai/kit'

let current: KitConfig | undefined

/**
 * 首次请求前加载运行期配置，hooks 和 SSR 使用同一份结果；修改环境后重启服务。
 * @example `const serverConfig = getAdminKitConfig()`
 */
export function getAdminKitConfig(): KitConfig {
  if (current)
    return current
  const result = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
  if (!result.success)
    throw new Error(result.error.message)
  const prefix = '/api/feedback/reports'
  // 容量来自配置，不依赖可选反馈的初始化/重试结果。
  const feedbackSettings = FeedbackConfigSchema.safeParse(core.config.get('feedback'))
  const material = resolveFeedbackBudget(feedbackSettings.success ? feedbackSettings.data : {}).maxTransportBytes
  current = { ...result.data, transport: result.data.transport === false
    ? false
    : { ...result.data.transport, routePlaintextBytes: {
        [prefix]: material,
        [`${prefix}/*/evidence`]: material,
        [`${prefix}/*/attachments/*`]: material,
        [`${prefix}/*/exports/*`]: material,
        ...result.data.transport.routePlaintextBytes,
      } } }
  return current
}
