import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

// memory 适用于本地示例；生产共享业务状态使用 Redis。
export async function cacheProfileExample() {
  const initialized = await cache.init({ type: 'memory' })
  if (!initialized.success)
    return initialized
  try {
    const saved = await cache.kv.set('example:user:1', { name: 'Alice' }, { ex: 60 })
    if (!saved.success)
      return saved
    const profile = await cache.kv.get<{ name: string }>('example:user:1')
    if (!profile.success)
      return profile
    // data 为 null 表示未命中，与连接失败不同。
    return profile
  }
  finally {
    const closed = await cache.close()
    if (!closed.success)
      core.logger.error('Example cache cleanup failed', { error: closed.error })
  }
}
