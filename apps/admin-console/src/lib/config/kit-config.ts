/**
 * @file src/lib/config/kit-config.ts
 *
 * Node 构建阶段读取并插值 `config/_kit.yml`，通过公开白名单为服务端 hooks
 * 与浏览器 apiFetch 提供一致的 transport 配置。修改后需重新启动或构建。
 */

import type { KitConfig } from '@h-ai/kit'
import { resolveKitConfig } from '@h-ai/kit'

/** Vite 仅注入公开传输配置，不含服务端 host/port 或其他私有配置。 */
declare const __ADMIN_KIT_CONFIG__: Pick<KitConfig, 'transport'>

const transportModeOverride = import.meta.env.VITE_HAI_E2E_KIT_TRANSPORT_MODE

function applyE2ETransportOverride(config: KitConfig): KitConfig {
  // 仅用于 Playwright：默认项目验证“明文 API / 旧测试夹具”链路时可显式关闭 transport，
  // transport-on 专项用例则保持 `_kit.yml` 原始配置，分别覆盖两种请求模式。
  if (transportModeOverride !== 'off') {
    return config
  }

  return { ...config, transport: false }
}

/** 当前 Admin Console 使用的 kit transport 配置。 */
export const adminConsoleKitConfig = applyE2ETransportOverride(resolveKitConfig(__ADMIN_KIT_CONFIG__))
