/**
 * @h-ai/crypto — 内部工具函数
 *
 * 提供 SM2/SM4 共用的编码转换辅助函数。 仅供模块内部使用，不对外导出。
 * @module crypto-utils
 */

/**
 * 内部编码启发式：仅检测+、/或末尾=，不是严格Base64验证器。
 * @param str - 原始密文文本。
 * @returns 是否走Base64解码分支；不能据此认可不可信输入。
 *
 * @example 模块内部上下文
 * ```ts
 * const likelyBase64 = isBase64('aGk=')
 * const likelyHex = isBase64('6869')
 * ```
 */
export function isBase64(str: string): boolean {
  return str.includes('+') || str.includes('/') || str.endsWith('=')
}

/**
 * 内部Hex转Base64工具；调用前保证有效且偶数长度Hex，本函数不校验编码。
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
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return btoa(String.fromCharCode(...bytes))
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
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
