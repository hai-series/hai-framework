/** SET 的共同输入边界，确保 memory 与 Redis 使用相同的过期及条件契约。 */
import type { HaiResult } from '@h-ai/core'
import type { SetOptions } from '../cache-types.js'
import { err, ok } from '@h-ai/core'
import { cacheM } from '../cache-i18n.js'
import { HaiCacheError } from '../cache-types.js'

/**
 * 已验证的单一过期策略；相对时间仍由 Redis 自身时钟执行。
 * @example 模块内部上下文
 * ```ts
 * const expiry: ValidatedSetOptions = { nx: true, xx: false, keepTtl: false, expiry: ['PX', 1000], expiresAt: Date.now() + 1000 }
 * const mode = expiry.expiry?.[0]
 * ```
 */
interface ValidatedSetOptions {
  /** 只允许不存在的键写入。 */
  nx: boolean
  /** 只允许存在的键写入，与 nx 互斥。 */
  xx: boolean
  /** 保留原 TTL，与所有显式期限互斥。 */
  keepTtl: boolean
  /** Redis 原生命令及对应正安全整数；不存在表示未指定期限。 */
  expiry?: ['EX' | 'PX' | 'EXAT' | 'PXAT', number]
  /** memory 使用的 Unix 毫秒期限；过去的正时间点会立即过期。 */
  expiresAt?: number
}

/**
 * 校验 SET 选项，不修改输入；零/负数、小数、非有限或不安全整数以及冲突策略均失败。
 * @param options - 调用方选项；省略时永久写入，条件未命中不会修改原值/TTL。
 * @returns 已验证策略或 INVALID_SET_OPTIONS；不抛业务异常。
 * @example 模块内部上下文
 * ```ts
 * const parsed = validateSetOptions({ nx: true, px: 1000 })
 * if (parsed.success) parsed.data.expiry
 * else parsed.error.code
 * ```
 */
export function validateSetOptions(options?: SetOptions): HaiResult<ValidatedSetOptions> {
  const invalid = () => err(HaiCacheError.INVALID_SET_OPTIONS, cacheM('cache_invalidSetOptions'))
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options)))
    return invalid()
  for (const flag of ['nx', 'xx', 'keepTtl'] as const) {
    if (options?.[flag] !== undefined && typeof options[flag] !== 'boolean')
      return invalid()
  }
  if (options?.nx && options.xx)
    return invalid()
  const entries = (['ex', 'px', 'exat', 'pxat'] as const).filter(key => options?.[key] !== undefined)
  if (entries.length > 1 || (entries.length > 0 && options?.keepTtl))
    return invalid()
  const result: ValidatedSetOptions = { nx: options?.nx === true, xx: options?.xx === true, keepTtl: options?.keepTtl === true }
  const mode = entries[0]
  if (mode) {
    const value = options![mode]!
    if (!Number.isSafeInteger(value) || value <= 0)
      return invalid()
    const milliseconds = mode === 'ex' || mode === 'exat' ? value * 1000 : value
    const expiresAt = mode === 'ex' || mode === 'px' ? Date.now() + milliseconds : milliseconds
    if (!Number.isSafeInteger(expiresAt))
      return invalid()
    const command = { ex: 'EX', px: 'PX', exat: 'EXAT', pxat: 'PXAT' } as const
    result.expiry = [command[mode], value]
    result.expiresAt = expiresAt
  }
  return ok(result)
}
