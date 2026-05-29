/**
 * @h-ai/ui — 浏览器能力安全辅助
 *
 * 统一封装容易在受限 WebView、隐私模式或不安全上下文中失败的浏览器 API，
 * 让组件在能力缺失时优雅降级而不是抛出运行时错误。
 */

/**
 * 安全读取 localStorage。
 *
 * 某些浏览器隐私模式或嵌入式 WebView 会在访问 localStorage 时直接抛出 SecurityError，
 * 这里统一吞掉异常并回退为 null。
 */
export function readStoredValue(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

/**
 * 安全写入 localStorage。
 *
 * 返回值显式告诉调用方持久化是否成功，方便调用方在失败时继续使用内存态而不必中断交互。
 */
export function writeStoredValue(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  try {
    localStorage.setItem(key, value)
    return true
  }
  catch {
    return false
  }
}

/**
 * 安全写入剪贴板。
 *
 * 在不安全上下文、旧 WebView 或浏览器策略禁用时直接返回 false，
 * 让上层决定是否展示成功反馈。
 */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    return false
  }
}
