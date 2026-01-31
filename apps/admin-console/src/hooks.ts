/**
 * =============================================================================
 * hai Admin Console - Client Hooks
 * =============================================================================
 * SvelteKit 客户端钩子配置（reroute 用于 i18n）
 * =============================================================================
 */

import type { Reroute } from '@sveltejs/kit'

// NOTE: deLocalizeUrl 会在 Paraglide 首次编译后自动生成
// 在 src/lib/paraglide/runtime.js 中
// 首次运行前请先执行 pnpm paraglide:compile 或 pnpm build

let deLocalizeUrl: ((url: URL) => URL) | null = null

// 动态导入（仅当生成后可用）
try {
  // @ts-expect-error - 生成文件可能不存在
  const paraglideRuntime = await import('$lib/paraglide/runtime.js')
  deLocalizeUrl = paraglideRuntime.deLocalizeUrl
}
catch {
  // Paraglide 尚未编译，跳过
}

/**
 * Reroute hook - 移除 URL 中的 locale 前缀用于路由匹配
 */
export const reroute: Reroute = (request) => {
  if (deLocalizeUrl) {
    return deLocalizeUrl(request.url).pathname
  }
  return request.url.pathname
}
