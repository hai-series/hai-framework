/** 求解逻辑独立于组件渲染；第三方计算能力仅在启用时加载。 */
import type { Challenge } from 'altcha/lib'

/**
 * 生成当前请求使用的单次证明；不缓存，不持久化，也不执行网络请求。
 * @param input - 已由认证动作取得的可公开挑战。
 * @param input.id - 服务端签发的挑战编号。
 * @param input.challenge - 原始公开挑战，包含算法参数与签名。
 * @param controller - 当前交互生命周期的取消控制器。
 * @returns 求解成功时返回证明；超过求解期限时返回 null。
 * @throws 取消或底层计算失败时抛错，由组件转换为安全的交互错误。
 * @example 模块内部上下文
 * ```ts
 * async function prove(challenge: Challenge) {
 *   return solveAuthCaptcha({ id: 'challenge-id', challenge }, new AbortController())
 * }
 * ```
 */
export async function solveAuthCaptcha(input: { id: string, challenge: Challenge }, controller: AbortController): Promise<string | null> {
  controller.signal.throwIfAborted()
  const { solveChallenge, pbkdf2 } = await import('altcha/lib')
  controller.signal.throwIfAborted()
  const solution = await solveChallenge({ challenge: input.challenge, deriveKey: pbkdf2.deriveKey, controller, timeout: 20000 })
  controller.signal.throwIfAborted()
  return solution ? JSON.stringify({ id: input.id, solution }) : null
}
