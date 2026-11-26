/** 服务端配置快照；SSR 调用方只投影公开传输参数，不能返回完整对象。 */
import type { KitConfig } from '@h-ai/kit'
import { apiContract } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

let current: KitConfig | undefined

/**
 * 首次请求前加载运行期配置，hooks 和 SSR 使用同一份结果；修改环境后重启服务。
 * @example `const serverConfig = getAdminKitConfig()`
 */
export function getAdminKitConfig(basePath = ''): KitConfig {
  if (current)
    return current
  const result = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
  if (!result.success)
    throw new Error(result.error.message)
  current = {
    ...result.data,
    transport: result.data.transport === false
      ? false
      : {
          ...result.data.transport,
          routePlaintextBytes: {
            ...apiContract.feedbackTransportRoutes(`${basePath}/api`),
            ...result.data.transport.routePlaintextBytes,
          },
        },
  }
  return current
}
