/**
 * @h-ai/kit — Client 模块导出
 *
 * 提供浏览器端 kit 能力，并通过 `kit.client.createSvelteKitNavAdapter` 接入 SvelteKit 路由。
 * @module index
 */

import { kit as browserKit } from '../browser.js'
import { createKitAuthActions } from './kit-client-auth.js'
import { createKitClient, installBrowserTransport, installBrowserTransportFetch } from './kit-client.js'
import { createSvelteKitNavAdapter } from './kit-nav-adapter.js'

export type { ClientTransportConfig, KitClient, KitClientConfig } from './kit-client.js'

/**
 * Kit client 子路径的统一入口。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit/client'
 *
 * // 创建浏览器客户端；不再使用时释放其状态。
 * const client = kit.client.create({ auth: false })
 * client.destroy()
 * ```
 */
export const kit = {
  ...browserKit,
  client: {
    createAuthActions: createKitAuthActions,
    installBrowserTransportFetch,
    installBrowserTransport,
    create: createKitClient,
    createSvelteKitNavAdapter,
  },
}
