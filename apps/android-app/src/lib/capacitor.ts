/**
 * android-app — Capacitor 初始化
 *
 * 在应用启动时调用，初始化 Capacitor 环境并配置状态栏。
 */

import { capacitor } from '@h-ai/capacitor'

/**
 * 初始化 Capacitor（应在 +layout.svelte onMount 中调用）
 */
export async function initCapacitor() {
  const result = await capacitor.init()
  if (!result.success) {
    return
  }

  // 配置沉浸式暗色文字状态栏
  await capacitor.statusBar.configure({
    style: 'dark',
    overlay: true,
  })
}
