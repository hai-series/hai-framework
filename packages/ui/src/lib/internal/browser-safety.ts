/**
 * @h-ai/ui — 浏览器能力安全辅助
 *
 * 统一封装容易在受限 WebView、隐私模式或不安全上下文中失败的浏览器 API，
 * 让组件在能力缺失时优雅降级而不是抛出运行时错误。
 */

/**
 * 宿主页面剪贴板写入器（跨域 iframe 场景由嵌入方注入）。
 *
 * @example
 * ```ts
 * import type { ClipboardHostWriter } from '@h-ai/ui'
 * const writer: ClipboardHostWriter = async text => {
 *   try { await navigator.clipboard.writeText(text); return true }
 *   catch { return false }
 * }
 * ```
 */
export type ClipboardHostWriter = (text: string) => Promise<boolean>

let clipboardHostWriter: ClipboardHostWriter | null = null

/**
 * 注册宿主页面剪贴板写入器。
 *
 * 当 iframe 内 Clipboard API 与 execCommand 都不可用时，把文本交给宿主页面写入。
 * 宿主仍须满足自身权限、焦点与用户激活要求；返回 false 表示实际写入未成功，不能保证兜底一定可用。
 *
 * @param writer - 宿主写入器；传入 null 注销
 * @returns {void} 无返回值；替换宿主写入器，null 用于注销。
 *
 * @example
 * ```ts
 * import { registerClipboardHostWriter } from '@h-ai/ui'
 * registerClipboardHostWriter(async text => {
 *   try { await navigator.clipboard.writeText(text); return true }
 *   catch { return false }
 * })
 * // 宿主销毁时注销，避免保留过期窗口闭包。
 * registerClipboardHostWriter(null)
 * ```
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
 * @param key - 要读取的条目或消息键。
 * @returns 偏好值；未保存、SSR 或读取失败时返回 null。
 *
 * @example 模块内部上下文
 * ```ts
 * const savedTheme = readStoredValue('demo-theme')
 * // 只保存非敏感偏好；不可用于认证 Token。
 * ```
 */
export function readStoredValue(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null
    }
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
 * @param key - 要读取的条目或消息键。
 * @param value - 待处理或校验的值。
 * @returns 持久化是否成功；失败时调用方可继续保留非敏感内存偏好。
 *
 * @example 模块内部上下文
 * ```ts
 * const persisted = writeStoredValue('demo-theme', 'dark')
 * if (!persisted) { const memoryTheme = 'dark' }
 * ```
 */
export function writeStoredValue(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false
    }
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
 * @param text - 待处理文本。
 * @returns 任一实际写入路径是否成功。
 *
 * @example
 * ```ts
 * import { writeTextToClipboard } from '@h-ai/ui'
 * const copied = await writeTextToClipboard('https://example.com/help')
 * if (!copied) throw new Error('Clipboard is unavailable')
 * ```
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
