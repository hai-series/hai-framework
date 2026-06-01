/**
 * Capacitor 初始化。
 */
import { capacitor } from '@h-ai/capacitor'

export async function isNativeApp(): Promise<boolean> {
  return capacitor.isNative()
}

export async function initCapacitor(): Promise<void> {
  await capacitor.init()

  if (capacitor.isNative()) {
    await capacitor.statusBar.configure({
      backgroundColor: '#ffffff',
      style: 'light',
      overlay: false,
    })
  }
}
