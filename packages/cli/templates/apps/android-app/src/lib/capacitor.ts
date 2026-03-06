/**
 * Capacitor 初始化
 *
 * 在应用启动时调用，配置状态栏等原生能力。
 */
import { capacitor } from '@h-ai/capacitor'

/**
 * 初始化 Capacitor 原生能力
 */
export async function initCapacitor(): Promise<void> {
  await capacitor.init()

  if (capacitor.isNative()) {
    await capacitor.statusBar.configure({
      backgroundColor: '#ffffff',
      style: 'LIGHT',
      overlay: false,
    })
  }
}
