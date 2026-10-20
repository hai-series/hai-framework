/** 构建期注入的桌面公开传输配置；修改后需重启开发进程或重新构建。 */
import type { DesktopCryptoConfigInput } from './crypto-config-schema.js'
import { resolveDesktopCryptoConfig } from './crypto-config-schema.js'

export type { DesktopCryptoConfig, DesktopCryptoConfigInput, DesktopCryptoTransportConfig } from './crypto-config-schema.js'
export { resolveDesktopCryptoConfig, resolveDesktopCryptoTransportConfig } from './crypto-config-schema.js'

/** Vite 已插值并校验的公开配置，不包含私有环境变量。 */
declare const __DESKTOP_CRYPTO_CONFIG__: DesktopCryptoConfigInput

/** 当前桌面端构建使用的配置，例如 { transport: { keyExchangePath: '/_hai/key-exchange' } }。 */
export const desktopCryptoConfig = resolveDesktopCryptoConfig(__DESKTOP_CRYPTO_CONFIG__)
