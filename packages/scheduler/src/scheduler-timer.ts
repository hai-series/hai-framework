/**
 * Node 计时器能表示的最大毫秒数，避免超限时实际等待被缩短为 1 毫秒。
 * @example 模块内部上下文
 * ```ts
 * const delay = Math.min(3_600_000, MAX_TIMER_MS)
 * ```
 */
export const MAX_TIMER_MS = 2_147_483_647
