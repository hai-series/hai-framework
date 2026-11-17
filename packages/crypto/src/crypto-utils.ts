/**
 * @h-ai/crypto — 内部工具函数
 *
 * 提供 SM2/SM4 共用的编码转换辅助函数。 仅供模块内部使用，不对外导出。
 * @module crypto-utils
 */

/**
 * 内部Hex转Base64工具；按块转换，避免大密文展开为函数参数导致栈溢出。
 * @param hex - 已校验Hex字节文本。
 * @returns Base64编码；大输入须在上层先限制预算。
 *
 * @example 模块内部上下文
 * ```ts
 * const encoded = hexToBase64('6869')
 * const decoded = base64ToHex(encoded)
 * ```
 */
export function hexToBase64(hex: string): string {
  const chunks: string[] = []
  const chunkBytes = 8192
  for (let offset = 0; offset < hex.length; offset += chunkBytes * 2) {
    const part = hex.slice(offset, offset + chunkBytes * 2)
    const bytes = new Uint8Array(part.length / 2)
    for (let i = 0; i < part.length; i += 2)
      bytes[i / 2] = Number.parseInt(part.slice(i, i + 2), 16)
    chunks.push(String.fromCharCode(...bytes))
  }
  return btoa(chunks.join(''))
}

/**
 * 内部Base64转小写Hex；非法输入由atob抛错，最近业务边界负责转换HaiResult。
 * @param base64 - 编码后的字节文本。
 * @returns 小写Hex字符串。
 * @throws TypeError或宿主atob解码异常。
 *
 * @example 模块内部上下文
 * ```ts
 * const decoded = base64ToHex('aGk=')
 * const encoded = hexToBase64(decoded)
 * ```
 */
export function base64ToHex(base64: string): string {
  if (base64.length % 4 !== 0 || /[^A-Z0-9+/=]/i.test(base64) || !/^[A-Z0-9+/]*={0,2}$/i.test(base64))
    throw new TypeError('Invalid Base64 encoding')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
