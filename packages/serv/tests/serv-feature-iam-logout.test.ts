/** 真实 HTTP、typed client 与 Redis 验证登出撤销，不依赖 access 尚有效。 */
import type { StartedTestContainer } from 'testcontainers'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createConnection } from 'node:net'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createIamProcedures } from '../src/features/serv-feature-iam.js'
import { serv } from '../src/serv-main.js'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)
let redis: StartedTestContainer | undefined
let node: ReturnType<typeof serv.listen> | undefined
let baseUrl = ''

/** 对独占 Redis 容器改变真实命令权限；错误由缓存驱动处理，不 mock 应用结果。 */
async function permit(command: 'get' | 'eval', allowed: boolean): Promise<void> {
  const endpoint = redis
  if (!endpoint)
    throw new Error('Redis fixture not initialized')
  const args = ['ACL', 'SETUSER', 'default', `${allowed ? '+' : '-'}${command}`]
  const request = `*${args.length}\r\n${args.map(value => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join('')}`
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: endpoint.getHost(), port: endpoint.getMappedPort(6379) })
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
  const registered = await iam.user.register({ username, password: 'ExampleOnly123!' })
  if (!registered.success)
    throw new Error(registered.error.message)
  const result = await iam.auth.login({ identifier: username, password: 'ExampleOnly123!' })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

beforeAll(async () => {
  redis = await new GenericContainer('docker.io/library/redis:7.4.11-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start()
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'redis', host: redis.getHost(), port: redis.getMappedPort(6379) })).success).toBe(true)
  expect((await iam.init({ seedDefaultData: false, rbac: { enabled: false }, session: { sliding: false } })).success).toBe(true)
  const app = serv.createApp({ contract, procedures: { iam: createIamProcedures({ iam }) }, iam })
  node = serv.listen(app, { host: '127.0.0.1', port: 0 })
  await once(node.server, 'listening')
  const address = node.server.address()
  if (!address || typeof address === 'string')
    throw new Error('Logout HTTP fixture did not start')
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`
  expect((await client.init({ baseUrl, auth: { storage: apiClient.tokenStorage.memory() } })).success).toBe(true)
}, 120000)

afterAll(async () => {
  try {
    if (redis) {
      await permit('get', true)
      await permit('eval', true)
    }
    await client.close()
    await node?.close()
    await iam.close()
    expect((await cache.close()).success).toBe(true)
    expect((await reldb.close()).success).toBe(true)
  }
  finally {
    await redis?.stop()
  }
})

it.each(['get', 'eval'] as const)('redis真实拒绝%s时HTTP结果不宣称撤销成功，恢复后原token可重试', async (command) => {
  const { tokens } = await login(`http-logout-${command}`)
  try {
    await permit(command, false)
    const result = await client.iam.auth.logout({ accessToken: tokens.accessToken })
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('data')
  }
  finally {
    await permit(command, true)
  }
  expect((await iam.auth.verifyToken(tokens.accessToken)).success).toBe(true)
  expect((await client.iam.auth.logout({ accessToken: tokens.accessToken })).success).toBe(true)
  expect((await iam.auth.verifyToken(tokens.accessToken)).success).toBe(false)
  expect((await client.iam.auth.refresh({ refreshToken: tokens.refreshToken })).success).toBe(false)
})

it('过期Bearer可撤销仍有效refresh，不需要先通过auth guard', async () => {
  const { tokens } = await login('http-logout-expired')
  const found = await iam.session.get(tokens.accessToken)
  if (!found.success || !found.data)
    throw new Error('Missing issued session')
  expect((await iam.session.update(tokens.accessToken, { expiresAt: new Date(Date.now() - 1) }, found.data.version)).success).toBe(true)
  expect((await iam.auth.verifyToken(tokens.accessToken)).success).toBe(false)
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true })
  expect((await client.iam.auth.refresh({ refreshToken: tokens.refreshToken })).success).toBe(false)
})

it('不能仅凭userId撤销他人会话；无令牌返回失败，持有未知令牌可幂等退出', async () => {
  const authenticated = await login('http-logout-victim')
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: authenticated.user.id }),
  })
  expect(await response.json()).toMatchObject({ success: false })
  expect((await iam.auth.verifyToken(authenticated.tokens.accessToken)).success).toBe(true)
  expect((await client.iam.auth.logout({ accessToken: 'not-a-session-token' })).success).toBe(true)
  expect((await iam.auth.verifyToken(authenticated.tokens.accessToken)).success).toBe(true)
})
