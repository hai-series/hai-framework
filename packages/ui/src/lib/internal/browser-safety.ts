/**
 * @h-ai/ui — 浏览器能力安全辅助
 *
 * 统一封装容易在受限 WebView、隐私模式或不安全上下文中失败的浏览器 API，
 * 让组件在能力缺失时优雅降级而不是抛出运行时错误。
 */

/** 宿主页面剪贴板写入器（跨域 iframe 场景由嵌入方注入）。 */
export type ClipboardHostWriter = (text: string) => Promise<boolean>

let clipboardHostWriter: ClipboardHostWriter | null = null

/**
 * 注册宿主页面剪贴板写入器。
 *
 * 当 iframe 内 Clipboard API 与 execCommand 都不可用时，把文本交给宿主页面写入。
 * 宿主页面是顶层文档，始终聚焦且持有完整剪贴板权限，是跨域 iframe 场景的最终兜底。
 *
 * @param writer - 宿主写入器；传入 null 注销
 */
export function registerClipboardHostWriter(
  writer: ClipboardHostWriter | null,
): void {
  clipboardHostWriter = writer
}

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
 * 或浏览器策略禁用时回退到 `document.execCommand('copy')`；
 * 跨域 iframe 中上述两种方式都可能被权限/聚焦策略拒绝时，再回退到宿主页面写入器，
 * 确保尽可能多的环境下复制操作可用。
 */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  // 现代 Clipboard API（仅安全上下文可用）
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // Clipboard API 失败时继续尝试 fallback
    }
  }

  // fallback：textarea + execCommand（兼容 HTTP、旧浏览器）
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (ok) {
        return true
      }
    }
    catch {
      // 继续尝试宿主写入器
    }
  }

  // 最终兜底：跨域 iframe 场景由宿主页面写入
  if (clipboardHostWriter) {
    try {
      return await clipboardHostWriter(text)
    }
    catch {
      return false
    }
  }

  return false
}
