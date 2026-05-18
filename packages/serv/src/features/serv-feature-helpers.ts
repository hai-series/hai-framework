/**
 * @h-ai/serv — features 公共辅助
 *
 * 把多个 feature procedure 中重复出现的 `HaiResult` 包装逻辑收敛到一处。
 * @module features/serv-feature-helpers
 */

import type { HaiResult } from '@h-ai/core'
import { ok } from '@h-ai/core'

/**
 * 把 `HaiResult<T[]>` 转换为 `HaiResult<{ items: T[] }>`。
 *
 * oRPC contract 中 list 类返回常用 `{ items: [...] }` 信封；
 * 业务模块通常直接返回数组，本工具负责套上信封。
 */
export function wrapItemsResult<T>(result: HaiResult<T[]>): HaiResult<{ items: T[] }> {
  if (!result.success)
    return result
  return ok({ items: result.data })
}

/**
 * 把 `HaiResult<T>` 通过 mapper 映射为 `HaiResult<U>`，错误透传。
 */
export function mapHaiResult<T, U>(result: HaiResult<T>, mapper: (data: T) => U): HaiResult<U> {
  if (!result.success)
    return result
  return ok(mapper(result.data))
}
