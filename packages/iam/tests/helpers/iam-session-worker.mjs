/** 独立进程在读取同一快照后等待屏障，再提交到真实共享 Redis。 */
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

/** 初始化独立节点，在快照屏障后执行会话操作并释放资源。 */
async function main() {
  const input = JSON.parse(process.env.IAM_SESSION_WORKER_INPUT)
  core.init({ logging: { level: 'fatal' } })
  try {
    for (const initialize of [
      () => reldb.init({ type: 'sqlite', database: ':memory:' }),
      () => cache.init(input.cache),
      () => iam.init({ seedDefaultData: false, session: { singleDevice: input.singleDevice, sliding: false } }),
    ]) {
      const initialized = await initialize()
      if (!initialized.success)
        throw new Error(`Session worker initialization failed (${initialized.error.code})`)
    }
    const userId = input.userId ?? 'two-process-refresh'
    const seeded = await reldb.sql.execute('INSERT INTO hai_iam_users (id, username, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [userId, userId, 1, Date.now(), Date.now()])
    if (!seeded.success)
      throw new Error('Session worker user seed failed: ' + seeded.error.message)
    const get = cache.kv.get.bind(cache.kv)
    let first = true
    cache.kv.get = async (...args) => {
      const snapshot = await get(...args)
      if (first && args[0].startsWith('hai:iam:sessions:')) {
        first = false
        await new Promise((resolve) => {
          process.once('message', resolve)
          process.send({ phase: 'snapshot' })
        })
      }
      return snapshot
    }
    const result = input.operation === 'refresh'
      ? await iam.session.refresh(input.refreshToken)
      : await iam.session.create({ userId: input.userId })
    process.stdout.write(JSON.stringify(result))
  }
  catch (error) {
    process.exitCode = 1
    process.stderr.write(error instanceof Error ? error.message : 'Session worker failed')
  }
  finally {
    await iam.close()
    await cache.close()
    await reldb.close()
    process.disconnect()
  }
}

void main()
