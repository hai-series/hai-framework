import { getAdminKitConfig } from '$lib/server/kit-config.js'

/** SSR 只传递公开传输配置，浏览器无需依赖构建机器的环境。 */
export function load() {
  return { kitConfig: getAdminKitConfig() }
}
