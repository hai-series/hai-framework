/**
 * @file src/lib/config/kit-config.ts
 *
 * 读取 `config/_kit.yml`，统一为 SvelteKit 服务端 hooks 与浏览器端 apiFetch
 * 提供同一份 transport 配置。该文件会被浏览器构建读取，因此仅应放公开的
 * 路径与开关，不要写入密钥；修改后需重新启动 Vite / SvelteKit 开发进程。
 */

import type { KitConfig, KitConfigInput } from '@h-ai/kit'
import { resolveKitConfig } from '@h-ai/kit'
import { parse } from 'yaml'
import rawKitConfig from '../../../config/_kit.yml?raw'

const transportModeOverride = import.meta.env.VITE_HAI_E2E_KIT_TRANSPORT_MODE

function applyE2ETransportOverride(config: KitConfig): KitConfig {
  // 仅用于 Playwright：默认项目验证“明文 API / 旧测试夹具”链路时可显式关闭 transport，
  // transport-on 专项用例则保持 `_kit.yml` 原始配置，分别覆盖两种请求模式。
  if (transportModeOverride !== 'off') {
    return config
  }

  return { ...config, transport: false }
}

function loadKitConfig(): KitConfig {
  const parsed = parse(rawKitConfig) as KitConfigInput | null | undefined
  return applyE2ETransportOverride(resolveKitConfig(parsed ?? {}))
}

/** 当前 Admin Console 使用的 kit transport 配置。 */
export const adminConsoleKitConfig = loadKitConfig()
