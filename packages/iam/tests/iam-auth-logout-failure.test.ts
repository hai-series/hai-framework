/** 真实 Redis 拒绝读/原子提交时，登出不能伪成功；过期 access 仍须撤销关联 refresh。 */
import type { RedisContainerLease } from './helpers/redis-container.js'
import { Buffer } from 'node:buffer'
import { createConnection } from 'node:net'
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { createCacheSessionRepository } from '../src/session/iam-session-repository-cache.js'
import { getUserSessionScope } from '../src/session/iam-session-utils.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

const TEST_PASSWORD = 'ExampleOnly123!'

let redis: RedisContainerLease | undefined

/** 只执行容器的 ACL 状态命令；真实 Redis 返回 NOPERM，无应用层故障 mock。 */
async function permit(command: 'get' | 'eval', allowed: boolean): Promise<void> {
  if (!redis)
    throw new Error('Redis fixture not initialized')
  const endpoint = redis
  const args = ['ACL', 'SETUSER', 'default', `${allowed ? '+' : '-'}${command}`]
  const request = `*${args.length}\r\n${args.map(value => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join('')}`
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: endpoint.host, port: endpoint.port })
    socket.setTimeout(5000)
    socket.once('connect', () => socket.write(request))
    socket.once('timeout', () => socket.destroy(new Error('Redis ACL fixture timed out')))
    socket.once('error', reject)
    socket.once('close', () => reject(new Error('Redis ACL fixture closed before confirmation')))
    let response = ''
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (!response.includes('\r\n'))
        return
      socket.destroy()
      if (response.startsWith('+OK\r\n'))
        resolve()
      else
        reject(new Error('Redis ACL fixture command failed'))
    })
  })
}

async function login(username: string) {
  const registered = await iam.user.register({ username, password: TEST_PASSWORD })
  if (!registered.success)
    throw new Error(registered.error.message)
  const result = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

beforeAll(async () => {
  redis = await acquireRedisContainer()
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'redis', host: redis.host, port: redis.port })).success).toBe(true)
  expect((await iam.init({ seedDefaultData: false, rbac: { enabled: false }, session: { sliding: false } })).success).toBe(true)
}, 120000)

afterAll(async () => {
  try {
    if (redis) {
      await permit('get', true)
      await permit('eval', true)
    }
    await iam.close()
    expect((await cache.close()).success).toBe(true)
    expect((await reldb.close()).success).toBe(true)
  }
  finally {
    await redis?.release()
  }
})

it.each(['get', 'eval'] as const)('redis拒绝%s时登出失败且保留凭据，恢复后同token可重试撤销', async (command) => {
  const authenticated = await login(`logout-fault-${command}`)
  const { accessToken, refreshToken } = authenticated.tokens
  const key = `hai:iam:sessions:{${getUserSessionScope(authenticated.user.id)}}`
  const before = await cache.kv.get(key)
  expect(before.success && before.data !== null).toBe(true)
  try {
    await permit(command, false)
    const result = await iam.auth.logout(accessToken)
    expect(result.success).toBe(false)
  }
  finally {
    await permit(command, true)
  }
  expect(await cache.kv.get(key)).toEqual(before)
  expect((await iam.auth.verifyToken(accessToken)).success).toBe(true)
  const pending = await createCacheSessionRepository(604800).getByRefreshToken(refreshToken)
  expect(pending.success && pending.data?.accessToken).toBe(accessToken)
  expect(await iam.auth.logout(accessToken)).toEqual({ success: true, data: undefined })
  expect((await iam.auth.verifyToken(accessToken)).success).toBe(false)
  expect((await iam.session.refresh(refreshToken)).success).toBe(false)
})

it('access已经过期但refresh仍有效时，登出仍原子撤销整个会话', async () => {
  const { tokens } = await login('logout-expired-access')
  const found = await iam.session.get(tokens.accessToken)
  if (!found.success || !found.data)
    throw new Error('Missing issued session')
  expect((await iam.session.update(tokens.accessToken, { expiresAt: new Date(Date.now() - 1) }, found.data.version)).success).toBe(true)
  expect(await iam.session.get(tokens.accessToken)).toEqual({ success: true, data: null })
  const pending = await createCacheSessionRepository(604800).getByRefreshToken(tokens.refreshToken)
  expect(pending.success && pending.data?.accessToken).toBe(tokens.accessToken)
  expect((await iam.auth.logout(tokens.accessToken)).success).toBe(true)
  expect((await iam.session.refresh(tokens.refreshToken)).success).toBe(false)
})

it('无效或已经撤销的token仍可幂等登出', async () => {
  expect((await iam.auth.logout('not-a-session-token')).success).toBe(true)
  const { tokens } = await login('logout-repeat')
  expect((await iam.auth.logout(tokens.accessToken)).success).toBe(true)
  expect((await iam.auth.logout(tokens.accessToken)).success).toBe(true)
})
