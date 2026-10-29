/** 让旧更新停在提交之前，先撤销/轮换，再恢复旧写入。 */
import { cache } from '@h-ai/cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'

async function operations(sliding = false) {
  const result = await createSessionOperations({ readCredential: async () => ({ success: true, data: { version: '', available: true } }), config: IamConfigSchema.parse({ session: { sliding } }) })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

/** 仅暂停第一个实际 CAS，不阻塞后续节点的撤销/新登录。 */
function pauseNextCommit() {
  const captured = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const commit = cache.kv.compareAndSwap.bind(cache.kv)
  let first = true
  vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation(async (...args) => {
    if (first) {
      first = false
      captured.resolve()
      await resume.promise
    }
    return commit(...args)
  })
  return { captured: captured.promise, resume: () => resume.resolve() }
}

beforeEach(async () => {
  await cache.init({ type: 'memory' })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})

it.each(['logout', 'logoutAll', 'refresh'] as const)('%s 后迟到的更新不能复活旧token', async (action) => {
  const ops = await operations()
  const created = await ops.create({ userId: `revoked-${action}` })
  if (!created.success)
    throw new Error(created.error.message)
  const original = created.data
  const gate = pauseNextCommit()
  const pending = ops.update(original.accessToken, { roles: ['late-admin'] }, original.version)
  await gate.captured
  if (action === 'logout')
    await ops.delete(original.accessToken)
  else if (action === 'logoutAll')
    await ops.deleteByUserId(original.userId)
  else expect((await ops.refresh(original.data!._tokenPair!.refreshToken)).success).toBe(true)
  gate.resume()
  expect((await pending).success).toBe(false)
  expect(await ops.get(original.accessToken)).toEqual({ success: true, data: null })
})

it('旧内容版本不能覆盖新资料，并行滑动读取不制造内容冲突', async () => {
  const ops = await operations(true)
  const created = await ops.create({ userId: 'version-update' })
  if (!created.success)
    throw new Error(created.error.message)
  const { accessToken, version } = created.data
  const reads = await Promise.all([ops.get(accessToken), ops.get(accessToken)])
  expect(reads.every(result => result.success && result.data?.version === version)).toBe(true)
  expect((await ops.update(accessToken, { data: { theme: 'dark' } }, version)).success).toBe(true)
  expect((await ops.update(accessToken, { data: { theme: 'stale' } }, version)).success).toBe(false)
  const latest = await ops.get(accessToken)
  expect(latest.success && latest.data?.data?.theme).toBe('dark')
  expect(latest.success && latest.data?.version).not.toBe(version)
})

it('迟到批量权限不能覆盖后续登录的会话', async () => {
  const ops = await operations()
  await ops.create({ userId: 'new-generation', roles: ['old'] })
  const gate = pauseNextCommit()
  const pending = ops.patchUserSessions('new-generation', { roles: ['stale-admin'] })
  await gate.captured
  await ops.deleteByUserId('new-generation')
  const fresh = await ops.create({ userId: 'new-generation', roles: ['new-user'] })
  if (!fresh.success)
    throw new Error(fresh.error.message)
  gate.resume()
  expect((await pending).success).toBe(true)
  const latest = await ops.get(fresh.data.accessToken)
  expect(latest.success && latest.data?.roles).toEqual(['new-user'])
})

it('迟到批量权限不能覆盖较新的会话内容版本', async () => {
  const ops = await operations()
  const created = await ops.create({ userId: 'permission-version', roles: ['old'] })
  if (!created.success)
    throw new Error(created.error.message)
  const gate = pauseNextCommit()
  const pending = ops.patchUserSessions('permission-version', { roles: ['stale-admin'] })
  await gate.captured
  expect((await ops.patchUserSessions('permission-version', { roles: ['current'] })).success).toBe(true)
  gate.resume()
  expect((await pending).success).toBe(false)
  const latest = await ops.get(created.data.accessToken)
  expect(latest.success && latest.data?.roles).toEqual(['current'])
})
