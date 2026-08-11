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
 * 优先使用现代 Clipboard API；在不安全上下文（HTTP）、旧 WebView
 * 或浏览器策略禁用时回退到 `document.execCommand('copy')`，
 * 确保尽可能多的环境下复制操作可用。
 */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false
  }

  // 现代 Clipboard API（仅安全上下文可用）
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // Clipboard API 失败时继续尝试 fallback
    }
  }

  // fallback：textarea + execCommand（兼容 HTTP、旧浏览器）
  if (typeof document === 'undefined') {
    return false
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }
  catch {
    return false
  }
}
