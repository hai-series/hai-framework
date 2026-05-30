import { capacitor } from '@h-ai/capacitor'

export async function initCapacitor(): Promise<void> {
  const result = await capacitor.init()
  if (!result.success) {
    return
  }

  await capacitor.statusBar.configure({
    style: 'dark',
    overlay: true,
  })
}
