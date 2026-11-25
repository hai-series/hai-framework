import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * Node 凭证比较使用原生恒时原语；不同长度直接失败，长度本身不受保护。
 * UTF-16LE 保留孤立代理项，避免 UTF-8 替换字符把两个不同字符串误判为相等。
 * @param a - 第一个原始字符串，不做 Unicode 归一化。
 * @param b - 第二个原始字符串，不做 Unicode 归一化。
 * @returns 字符串的 UTF-16 单元是否完全一致。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const matches = core.string.constantTimeEqual('example-only', 'example-only')
 * ```
 */
export function constantTimeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a, 'utf16le'), Buffer.from(b, 'utf16le'))
}
