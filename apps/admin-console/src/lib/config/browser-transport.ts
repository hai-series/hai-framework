import { adminConsoleKitConfig } from '$lib/config/kit-config.js'
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

const adminConsoleBrowserTransportConfig = adminConsoleKitConfig.transport === false
  ? undefined
  : {
      crypto,
      keyExchangeUrl: adminConsoleKitConfig.transport.keyExchangePath,
      excludePaths: [...adminConsoleKitConfig.transport.excludePaths],
    }

// 浏览器端 API / __data.json 都依赖同一套 transport client。
if (typeof window !== 'undefined' && adminConsoleBrowserTransportConfig) {
  void crypto.init()
  kit.client.installBrowserTransportFetch(adminConsoleBrowserTransportConfig)
}
