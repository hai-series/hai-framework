/**
 * @h-ai/crypto — 内部工具函数
 *
 * 提供 SM2/SM4 共用的编码转换辅助函数。 仅供模块内部使用，不对外导出。
 * @module crypto-utils
 */

/**
 * 判断字符串是否为 Base64 格式
 *
 * 使用简单启发式：包含 +、/ 或以 = 结尾视为 base64。
 *
 * @param str - 待检测字符串
 */
export function isBase64(str: string): boolean {
  return str.includes('+') || str.includes('/') || str.endsWith('=')
}

/**
 * Hex 字符串转 Base64 编码
 *
 * 使用 Web 标准 API btoa，前后端通用（Node 16+ / 所有现代浏览器）。
 *
 * @param hex - 十六进制字符串（长度必须为偶数）
 * @returns Base64 编码字符串
 */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Base64 编码转 Hex 字符串
 *
 * 使用 Web 标准 API atob，前后端通用（Node 16+ / 所有现代浏览器）。
 *
 * @param base64 - Base64 编码字符串
 * @returns 小写十六进制字符串
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
