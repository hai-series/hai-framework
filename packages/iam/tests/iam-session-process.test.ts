/** 两个独立 Node 进程读取相同快照，验证真实 Redis 原子提交。 */
import type { HaiResult } from '@h-ai/core'
import type { Buffer } from 'node:buffer'
import type { Session, TokenPair } from '../src/session/iam-session-types.js'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cache } from '@h-ai/cache'
import { expect, it } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

/** 只有两个进程都完成同一次读取才放行，确保实际覆盖竞争窗口。 */
async function race<T>(input: Record<string, unknown>): Promise<HaiResult<T>[]> {
  const children: ReturnType<typeof spawn>[] = []
  let snapshots = 0
  try {
    const tasks = Array.from({ length: 2 }, () => new Promise<HaiResult<T>>((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/iam-session-worker.mjs', import.meta.url))], {
        env: { ...process.env, IAM_SESSION_WORKER_INPUT: JSON.stringify(input) },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      children.push(child)
      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('Session worker timed out'))
      }, 30000)
      child.stdout!.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr!.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      child.on('message', (message) => {
        if (typeof message === 'object' && message && 'phase' in message && message.phase === 'snapshot') {
          snapshots++
          if (snapshots === 2) {
            for (const worker of children) worker.send({ phase: 'continue' })
          }
        }
      })
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(stderr || 'Session worker failed'))
        }
        else {
          try {
            resolve(JSON.parse(stdout))
          }
          catch {
            reject(new Error('Invalid session worker output'))
          }
        }
      })
    }))
    return await Promise.all(tasks)
  }
  finally {
    for (const child of children) {
      if (child.exitCode === null)
        child.kill()
    }
  }
}

it('真实Redis双进程refresh唯一后继，singleDevice最终仅一个会话有效', async () => {
  const redis = await acquireRedisContainer()
  const config = { type: 'redis' as const, host: redis.host, port: redis.port }
  try {
    expect((await cache.init(config)).success).toBe(true)
    const createdOps = await createSessionOperations({ config: IamConfigSchema.parse({ session: { sliding: false } }) })
    if (!createdOps.success)
      throw new Error(createdOps.error.message)
    const ops = createdOps.data
    const original = await ops.create({ userId: 'two-process-refresh' })
    if (!original.success)
      throw new Error(original.error.message)
    const rotated = await race<TokenPair>({ cache: config, operation: 'refresh', refreshToken: original.data.data!._tokenPair!.refreshToken })
    expect(rotated.filter(result => result.success)).toHaveLength(1)
    expect(await ops.get(original.data.accessToken)).toEqual({ success: true, data: null })
    const winner = rotated.find(result => result.success)
    if (!winner?.success)
      throw new Error('No successful rotation')
    expect((await ops.verifyToken(winner.data.accessToken)).success).toBe(true)
    const logins = await race<Session>({ cache: config, operation: 'create', singleDevice: true, userId: 'two-process-single' })
    expect(logins.every(result => result.success)).toBe(true)
    const valid = await Promise.all(logins.map(async result => result.success && (await ops.verifyToken(result.data.accessToken)).success))
    expect(valid.filter(Boolean)).toHaveLength(1)
  }
  finally {
    await cache.close()
    await redis.release()
  }
}, 120000)
