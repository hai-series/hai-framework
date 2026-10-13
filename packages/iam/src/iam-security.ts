/** IAM 共享状态临界区；所有节点必须连接同一 Redis。 */
import type { HaiResult } from '@h-ai/core'
import { cache } from '@h-ai/cache'
import { err } from '@h-ai/core'
import { iamM } from './iam-i18n.js'
import { HaiIamError } from './iam-types.js'
import { generateToken } from './session/iam-session-utils.js'

/** 在带唯一 owner 的共享锁内执行短数据库/缓存操作；通知发送放在临界区外。 */
export async function withIamLock<T>(key: string, operation: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  const owner = generateToken()
  const lockKey = `hai:iam:security:${key}`
  for (let attempt = 0; attempt < 500; attempt++) {
    const acquired = await cache.lock.acquire(lockKey, { owner, ttl: 30 })
    if (!acquired.success)
      return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'), acquired.error)
    if (acquired.data) {
      let leaseValid = true
      // 每个持有者有唯一 owner；续约失败后不能对外声明临界区操作成功。
      const renewal = setInterval(() => {
        void cache.lock.extend(lockKey, 30, owner).then((result) => {
          if (!result.success || !result.data)
            leaseValid = false
        }).catch(() => { leaseValid = false })
      }, 10_000)
      try {
        const result = await operation()
        if (!leaseValid)
          return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'))
        return result
      }
      catch (error) {
        return err(HaiIamError.INTERNAL_ERROR, iamM('iam_securityStateFailed'), error)
      }
      finally {
        clearInterval(renewal)
        // owner 校验避免旧请求释放其他节点后来取得的锁。
        await cache.lock.release(lockKey, owner)
      }
    }
    // 总等待约五秒；超过预算返回 SECURITY_BUSY，让调用方稍后重试。
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
}
