import type { Buffer } from 'node:buffer'
/** 多个独立 Node 进程共享 PostgreSQL/Redis，验证跨节点限制。 */
// 独立 worker 加载本包 dist；turbo.json 要求先完成本包 build，避免其他依赖构建清理产物时读取。
import type { IamConfigInput } from '../src/iam-types.js'
import type { PostgresContainerLease } from './helpers/postgres-container.js'
import type { RedisContainerLease } from './helpers/redis-container.js'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { HaiIamError, iam } from '../src/index.js'
import { expectAccountLocked } from './helpers/iam-test-suite.js'
import { acquirePostgresContainer } from './helpers/postgres-container.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

let pg: PostgresContainerLease
let redis: RedisContainerLease
let db: Parameters<typeof reldb.init>[0]
let cacheConfig: Parameters<typeof cache.init>[0]
const settings: IamConfigInput = { otp: {}, security: { maxLoginAttempts: 3, lockoutDuration: 60 } }
let code = ''
let token = ''
beforeAll(async () => {
  ;[pg, redis] = await Promise.all([acquirePostgresContainer(), acquireRedisContainer()])
  db = { type: 'postgresql', host: pg.host, port: pg.port, database: pg.database, user: pg.user, password: pg.password }
  cacheConfig = { type: 'redis', host: redis.host, port: redis.port }
  expect((await reldb.init(db)).success).toBe(true)
  expect((await cache.init(cacheConfig)).success).toBe(true)
  expect((await iam.init({ ...settings, onOtpSendEmail: async (_id, value) => {
    code = value
  }, onPasswordResetRequest: async (_user, value) => {
    token = value
  } })).success).toBe(true)
}, 300_000)
afterAll(async () => {
  await iam.close()
  await cache.close()
  await reldb.close()
  await pg?.release()
  await redis?.release()
}, 300_000)

function worker(input: object): Promise<{ success: boolean, code?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/iam-security-worker.mjs', import.meta.url))], { env: { ...process.env, IAM_SECURITY_WORKER_INPUT: JSON.stringify({ db, cache: cacheConfig, iam: settings, ...input }) }, windowsHide: true })
    let output = ''
    let diagnostics = ''
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      diagnostics += data.toString()
    })
    child.on('error', reject)
    child.on('exit', (status) => {
      if (status !== 0)
        reject(new Error(`IAM security worker exited (${status}): ${diagnostics.slice(-1000)}`))
      else resolve(JSON.parse(output))
    })
  })
}

it('独立节点累计错误密码达到统一锁定阈值', async () => {
  expect((await iam.user.register({ username: 'distributed-password', password: 'Password123' })).success).toBe(true)
  const results = await Promise.all(Array.from({ length: 6 }, () => worker({ operation: 'password', credentials: { identifier: 'distributed-password', password: 'wrong' } })))
  expect(results.every(result => !result.success)).toBe(true)
  expect(await iam.auth.login({ identifier: 'distributed-password', password: 'Password123' })).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code } })
  await expectAccountLocked('distributed-password')
}, 60_000)

it('独立节点仅有一次 OTP 消费和一次发送成功', async () => {
  await iam.auth.sendOtp('distributed-otp@example.com')
  const results = await Promise.all(Array.from({ length: 6 }, () => worker({ operation: 'otp', credentials: { identifier: 'distributed-otp@example.com', code } })))
  expect(results.filter(result => result.success)).toHaveLength(1)
  const sent = await Promise.all(Array.from({ length: 6 }, () => worker({ operation: 'send', identifier: 'distributed-send@example.com' })))
  expect(sent.filter(result => result.success)).toHaveLength(1)
}, 60_000)

it('独立节点同时重置同一令牌只允许一次成功', async () => {
  await iam.user.register({ username: 'distributed-reset', password: 'Password123' })
  await iam.user.requestPasswordReset('distributed-reset')
  const results = await Promise.all(Array.from({ length: 6 }, () => worker({ operation: 'reset', token, password: 'NewPassword456' })))
  expect(results.filter(result => result.success)).toHaveLength(1)
  expect((await iam.auth.login({ identifier: 'distributed-reset', password: 'NewPassword456' })).success).toBe(true)
}, 60_000)
