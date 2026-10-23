/** 真实共享 Redis/SQLite 与独立 Node 进程验证暂停/接管后的最终提交。 */
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

interface WorkerResult { success: boolean, code?: string, pausedFor: number }

function pausedWorker(input: object) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/iam-security-commit-worker.mjs', import.meta.url))], {
    env: { ...process.env, IAM_COMMIT_WORKER_INPUT: JSON.stringify(input) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => child.kill(), 90_000)
  child.once('exit', () => clearTimeout(timer))
  const paused = new Promise<void>((resolve, reject) => {
    child.once('message', () => resolve())
    child.once('error', reject)
    child.once('exit', () => reject(new Error(`Worker exited before pause: ${stderr || stdout}`)))
  })
  const done = new Promise<WorkerResult>((resolve, reject) => {
    child.stdout!.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr!.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    child.once('error', reject)
    child.once('exit', (status) => {
      if (status !== 0) {
        reject(new Error(`Commit worker failed (${status}): ${stderr.slice(-1000)}`))
      }
      else {
        try {
          resolve(JSON.parse(stdout))
        }
        catch {
          reject(new Error('Invalid commit worker output'))
        }
      }
    })
  })
  // 启动或断言失败时 finally 仍负责 kill；提前观察拒绝，避免孤立 Promise 泄漏。
  void done.catch(() => {})
  return { child, paused, done }
}

/** 只删除本测试在系统临时目录下创建的确定目录。 */
async function removeTestFolder(folder: string): Promise<void> {
  const absolute = resolve(folder)
  if (dirname(absolute) !== resolve(tmpdir()) || !absolute.startsWith(join(resolve(tmpdir()), 'hai-iam-commit-')))
    throw new Error('Unexpected commit test directory')
  await rm(absolute, { recursive: true, force: true })
}

it('独立旧节点实际暂停45秒后，OTP旧CAS与密码旧SQL都被接管后的持久状态拒绝', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hai-iam-commit-'))
  const workers: ReturnType<typeof pausedWorker>[] = []
  let redis: Awaited<ReturnType<typeof acquireRedisContainer>> | undefined
  try {
    redis = await acquireRedisContainer()
    const db = { type: 'sqlite' as const, database: join(folder, 'iam.db') }
    const cacheConfig = { type: 'redis' as const, host: redis.host, port: redis.port }
    expect((await reldb.init(db)).success).toBe(true)
    expect((await cache.init(cacheConfig)).success).toBe(true)
    let code = ''
    let token = ''
    expect((await iam.init({ otp: { resendInterval: 30, expiresIn: 120 }, onOtpSendEmail: async (_id, value) => {
      code = value
    }, onPasswordResetRequest: async (_user, value) => {
      token = value
    } })).success).toBe(true)
    expect((await iam.user.register({ username: 'commit-reset', password: 'Password123' })).success).toBe(true)
    expect((await iam.auth.sendOtp('commit-otp@example.com')).success).toBe(true)
    expect((await iam.user.requestPasswordReset('commit-reset')).success).toBe(true)
    workers.push(pausedWorker({ db, cache: cacheConfig, operation: 'otp', identifier: 'commit-otp@example.com', code }))
    workers.push(pausedWorker({ db, cache: cacheConfig, operation: 'reset', token }))
    await Promise.all(workers.map(worker => worker.paused))
    expect((await iam.user.requestPasswordReset('commit-reset')).success).toBe(true)
    expect((await iam.user.confirmPasswordReset(token, 'NewNodePassword345')).success).toBe(true)
    // 真实时间跨过配置的30秒发送间隔及旧锁期限，不改系统时钟或存储值。
    await new Promise(resolve => setTimeout(resolve, 31_000))
    expect((await iam.auth.sendOtp('commit-otp@example.com')).success).toBe(true)
    const results = await Promise.all(workers.map(worker => worker.done))
    expect(results.every(result => result.pausedFor >= 44_000 && !result.success)).toBe(true)
    expect((await iam.auth.loginWithOtp({ identifier: 'commit-otp@example.com', code })).success).toBe(true)
    expect((await iam.auth.login({ identifier: 'commit-reset', password: 'NewNodePassword345' })).success).toBe(true)
    expect((await iam.auth.login({ identifier: 'commit-reset', password: 'OldWorkerPassword234' })).success).toBe(false)
  }
  finally {
    for (const worker of workers) {
      if (worker.child.exitCode === null)
        worker.child.kill()
    }
    await Promise.allSettled(workers.map(worker => worker.done))
    await iam.close()
    await cache.close()
    await reldb.close()
    await redis?.release()
    await removeTestFolder(folder)
  }
}, 120_000)
