/** 两个独立生产模式 Node 共享真实 PG/Redis，覆盖新增策略和故障恢复。 */
import type { HaiResult } from '@h-ai/core'
import type { AuthResult, IamConfigInput, IamPublicConfig } from '../src/index.js'
import { fork } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { pbkdf2, solveChallenge } from 'altcha/lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { TEST_PASSWORD } from './helpers/iam-test-suite.js'
import { acquirePostgresContainer } from './helpers/postgres-container.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

function worker(configuration: object) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:HAI_|PUBLIC_|VITE_)/i.test(key)))
  const child = fork(fileURLToPath(new URL('./helpers/iam-policy-worker.mjs', import.meta.url)), { env: { ...environment, NODE_ENV: 'production', HAI_CORE_ENV: 'production', IAM_POLICY_FIXTURE: JSON.stringify(configuration) }, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  let sequence = 0
  const pending = new Map<number, { resolve: (value: unknown) => void, reject: (cause: Error) => void }>()
  const seed = Promise.withResolvers<void>()
  const ready = Promise.withResolvers<void>()
  const closed = Promise.withResolvers<void>()
  void ready.promise.catch(() => {})
  void seed.promise.catch(() => {})
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object')
      return
    if ('phase' in message) {
      if (message.phase === 'seed-ready')
        seed.resolve()
      if (message.phase === 'ready')
        ready.resolve()
      if (message.phase === 'failed') {
        const failure = new Error('Policy worker initialization failed')
        ready.reject(failure)
        seed.reject(failure)
      }
    }
    if ('id' in message && typeof message.id === 'number') {
      const call = pending.get(message.id)
      pending.delete(message.id)
      if ('result' in message)
        call?.resolve(message.result)
      else call?.reject(new Error('Policy worker command failed'))
    }
  })
  child.once('error', (error) => {
    ready.reject(error)
    seed.reject(error)
  })
  child.once('close', () => {
    closed.resolve()
    const failure = new Error('Policy worker exited')
    ready.reject(failure)
    seed.reject(failure)
    for (const call of pending.values()) call.reject(failure)
    pending.clear()
  })
  async function deadline<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Policy worker timed out')), 30000)
      })])
    }
    finally {
      clearTimeout(timer)
    }
  }
  return {
    child,
    closed: closed.promise,
    waitClosed: () => deadline(closed.promise),
    seed: () => deadline(seed.promise),
    ready: () => deadline(ready.promise),
    releaseSeed: () => child.send({ action: 'releaseSeed' }),
    async call<T>(action: string, args: object = {}): Promise<HaiResult<T>> {
      const id = ++sequence
      const response = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }))
      child.send({ id, action, args })
      // IPC 只接收该固定夹具的 HaiResult；业务断言仍核对 success 和所需字段。
      return await deadline(response) as HaiResult<T>
    },
  }
}

describe.sequential('生产 PG+Redis 独立策略节点', () => {
  let pg: Awaited<ReturnType<typeof acquirePostgresContainer>> | undefined
  let redis: Awaited<ReturnType<typeof acquireRedisContainer>> | undefined
  const nodes: ReturnType<typeof worker>[] = []
  const settings: IamConfigInput = { reauthentication: { enabled: true, operations: ['orders.approve'] }, rbac: { defaultRole: '' } }
  const previousLevel = core.logger.getLevel()
  beforeAll(async () => {
    core.logger.setLevel('fatal')
    pg = await acquirePostgresContainer()
    redis = await acquireRedisContainer()
    const db = { type: 'postgresql' as const, host: pg.host, port: pg.port, database: pg.database, user: pg.user, password: pg.password }
    const sharedCache = { type: 'redis' as const, host: redis.host, port: redis.port }
    expect((await reldb.init(db)).success).toBe(true)
    expect((await cache.init(sharedCache)).success).toBe(true)
    const configuration = { db, cache: sharedCache, iam: settings, seedBarrier: true }
    nodes.push(worker(configuration), worker(configuration))
    await Promise.all(nodes.map(node => node.seed()))
    for (const node of nodes) node.releaseSeed()
    await Promise.all(nodes.map(node => node.ready()))
    expect((await iam.init({ ...settings, seedDefaultData: false })).success).toBe(true)
  }, 180000)
  afterAll(async () => {
    const cleanups: Array<() => Promise<unknown>> = [
      ...nodes.map(node => async () => {
        try {
          if (node.child.connected)
            await node.call('close')
        }
        finally {
          if (node.child.exitCode === null)
            node.child.kill()
          await node.waitClosed()
        }
      }),
      () => iam.close(),
      () => cache.close(),
      () => reldb.close(),
      async () => pg?.release(),
      async () => redis?.release(),
    ]
    const failures: number[] = []
    for (const [index, cleanup] of cleanups.entries()) {
      try {
        await cleanup()
      }
      catch {
        failures.push(index)
      }
    }
    core.logger.setLevel(previousLevel)
    expect(failures).toEqual([])
  }, 60000)

  it('空库两个节点同时播种均成功，角色权限关联完整且无重复', async () => {
    expect(new Set(nodes.map(node => node.child.pid)).size).toBe(2)
    const roles = await iam.authz.getAllRoles()
    const permissions = await iam.authz.getAllPermissions({ pageSize: 1000 })
    expect(roles.success && permissions.success).toBe(true)
    if (!roles.success || !permissions.success)
      return
    expect(roles.data.items.map(role => role.code).sort()).toEqual(['admin', 'guest', 'user'])
    expect(new Set(permissions.data.items.map(permission => permission.code)).size).toBe(permissions.data.total)
    const admin = roles.data.items.find(role => role.code === 'admin')!
    const assigned = await iam.authz.getRolePermissions(admin.id)
    expect(assigned.success && assigned.data.length).toBe(permissions.data.total)
  })

  it('超管改名立即撤销另一进程的隐式权限，恢复代码后重新生效', async () => {
    const created = await iam.user.createUser({ username: 'process-super-user', password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: 'super_admin', name: 'Process super administrator' })
    if (!created.success || !role.success)
      throw new Error('Shared role fixture failed')
    expect((await iam.authz.assignRole(created.data.user.id, role.data.id)).success).toBe(true)
    const args = { userId: created.data.user.id, permission: 'unassigned:write' }
    expect(await nodes[0]!.call('permission', args)).toMatchObject({ success: true, data: true })
    expect((await nodes[1]!.call('renameRole', { id: role.data.id, code: 'former_super_admin' })).success).toBe(true)
    expect(await nodes[0]!.call('permission', args)).toMatchObject({ success: true, data: false })
    expect((await nodes[1]!.call('renameRole', { id: role.data.id, code: 'super_admin' })).success).toBe(true)
    expect(await nodes[0]!.call('permission', args)).toMatchObject({ success: true, data: true })
  })

  it('动态规则、单次用途证明与停用跨节点生效，热缓存可用且必要读取故障拒绝后可恢复', async () => {
    const user = await iam.user.createUser({ username: 'process-policy-user', password: TEST_PASSWORD })
    const permission = await iam.authz.createPermission({ code: 'process:policy', name: 'Process policy' })
    if (!user.success || !permission.success)
      throw new Error('Policy fixture failed')
    const logged = await nodes[0]!.call<AuthResult>('login', { credentials: { identifier: user.data.user.username, password: TEST_PASSWORD } })
    if (!logged.success)
      throw new Error('Policy login failed')
    const token = logged.data.tokens.accessToken
    expect((await nodes[1]!.call('setRules', { id: permission.data.id, operations: ['db.approve'] })).success).toBe(true)
    expect(await nodes[0]!.call<IamPublicConfig>('publicConfig')).toMatchObject({ success: true, data: { reauthentication: { operations: ['db.approve', 'orders.approve'] } } })
    expect((await nodes[0]!.call('checkSensitive', { token, operation: 'db.approve' })).success).toBe(false)
    const proof = await nodes[0]!.call<{ ticket: string }>('reauthenticate', { token, password: TEST_PASSWORD, operation: 'db.approve' })
    if (!proof.success)
      throw new Error('Proof was not issued')
    const raced = await Promise.all(nodes.map(node => node.call('checkSensitive', { token, operation: 'db.approve', ticket: proof.data.ticket })))
    expect(raced.filter(result => result.success)).toHaveLength(1)
    expect((await nodes[1]!.call('disconnectCache')).success).toBe(true)
    expect((await nodes[1]!.call('verify', { token })).success).toBe(false)
    expect((await nodes[1]!.call('reconnectCache')).success).toBe(true)
    expect((await nodes[1]!.call('verify', { token })).success).toBe(true)
    expect((await nodes[1]!.call('disconnectDatabase')).success).toBe(true)
    expect((await nodes[1]!.call('verify', { token })).success).toBe(true)
    // 另一节点的安全写入推进代际；数据库不可用时不能沿用旧代的授权。
    expect((await nodes[0]!.call('setRules', { id: permission.data.id, operations: ['db.approve'] })).success).toBe(true)
    expect((await nodes[1]!.call('verify', { token })).success).toBe(false)
    expect((await nodes[1]!.call('reconnectDatabase')).success).toBe(true)
    expect((await nodes[1]!.call('verify', { token })).success).toBe(true)
    expect((await nodes[1]!.call('updateUser', { id: user.data.user.id, data: { accountStatus: 'dormant' } })).success).toBe(true)
    expect((await nodes[0]!.call('verify', { token })).success).toBe(false)
    expect((await nodes[0]!.call('refresh', { token: logged.data.tokens.refreshToken })).success).toBe(false)
  })

  it('验证码在另一进程可鉴别且仅消费一次，真实PG凭据校验下App额度不超配', async () => {
    const configuration = { captcha: { enabled: true, cost: 100, maxCounter: 2 }, session: { maxSessions: 2, terminalLimits: { app: 1, web: 1 } } }
    for (const node of nodes) expect((await node.call('configure', configuration)).success).toBe(true)
    const user = await iam.user.createUser({ username: 'process-captcha-user', password: TEST_PASSWORD })
    if (!user.success)
      throw new Error('Captcha user fixture failed')
    const challenge = await nodes[0]!.call<{ id: string, challenge: Parameters<typeof solveChallenge>[0]['challenge'] }>('captcha', { operation: 'login' })
    if (!challenge.success)
      throw new Error('Challenge fixture failed')
    const solution = await solveChallenge({ challenge: challenge.data.challenge, deriveKey: pbkdf2.deriveKey })
    const credentials = { identifier: user.data.user.username, password: TEST_PASSWORD, captcha: JSON.stringify({ id: challenge.data.id, solution }) }
    expect((await nodes[1]!.call('login', { credentials, context: { terminalType: 'web' } })).success).toBe(true)
    expect((await nodes[0]!.call('login', { credentials, context: { terminalType: 'web' } })).success).toBe(false)
    for (const node of nodes) expect((await node.call('configure', { ...configuration, captcha: { enabled: false } })).success).toBe(true)
    const raced = await Promise.all(nodes.map(node => node.call('login', { credentials: { identifier: user.data.user.username, password: TEST_PASSWORD }, context: { terminalType: 'app' } })))
    expect(raced.filter(result => result.success)).toHaveLength(1)
  })
})
