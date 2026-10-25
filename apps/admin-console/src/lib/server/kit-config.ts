/** 服务端运行配置经 Schema 校验后，仅向浏览器提供公开的传输参数。 */
import type { KitConfig } from '@h-ai/kit'
import { core } from '@h-ai/core'
import { feedback } from '@h-ai/feedback'
import { KitConfigSchema } from '@h-ai/kit'

let current: Pick<KitConfig, 'transport'> | undefined

/**
 * 首次请求前加载运行期配置，hooks 和 SSR 使用同一份结果；修改环境后重启服务。
 * @example `const publicConfig = getAdminKitConfig()`
 */
export function getAdminKitConfig(): Pick<KitConfig, 'transport'> {
  if (current)
    return current
  const result = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
  if (!result.success)
    throw new Error(result.error.message)
  current = { transport: result.data.transport === false ? false : { ...result.data.transport, maxPlaintextBytes: feedback.budget.maxTransportBytes } }
  return current
}
