/** 会话提交失败与并发轮换的定向回归，不依赖账号数据库。 */
import { cache, HaiCacheError } from '@h-ai/cache'
import { err } from '@h-ai/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/iam-config.js'
import { createSessionOperations } from '../src/session/iam-session-functions.js'

async function sessions(singleDevice = false) {
  const result = await createSessionOperations({ readCredential: async () => ({ success: true, data: { version: '', available: true } }), config: IamConfigSchema.parse({ session: { singleDevice, sliding: false } }) })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await cache.init({ type: 'memory' })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})

it('同一refresh仅一个后继，旧access与refresh一起撤销', async () => {
  const ops = await sessions()
  const original = await ops.create({ userId: 'refresh-race' })
  if (!original.success)
    throw new Error(original.error.message)
  const token = original.data.data!._tokenPair!.refreshToken
  const results = await Promise.all([ops.refresh(token), ops.refresh(token)])
  expect(results.filter(result => result.success)).toHaveLength(1)
  expect(await ops.get(original.data.accessToken)).toEqual({ success: true, data: null })
  expect((await ops.refresh(token)).success).toBe(false)
  const winner = results.find(result => result.success)
  if (!winner?.success)
    throw new Error('No rotation winner')
  expect((await ops.verifyToken(winner.data.accessToken)).success).toBe(true)
})

it('并发单设备发布最终只有一个有效会话', async () => {
  const ops = await sessions(true)
  const results = await Promise.all([ops.create({ userId: 'single-race' }), ops.create({ userId: 'single-race' })])
  const valid = await Promise.all(results.map(async result => result.success && (await ops.verifyToken(result.data.accessToken)).success))
  expect(results.every(result => result.success)).toBe(true)
  expect(valid.filter(Boolean)).toHaveLength(1)
})

it('轮换发布失败保留旧会话，不撤销后再制造半成品', async () => {
  const ops = await sessions()
  const created = await ops.create({ userId: 'failure-rotation' })
  if (!created.success)
    throw new Error(created.error.message)
  const refresh = created.data.data!._tokenPair!.refreshToken
  vi.spyOn(cache.kv, 'compareAndSwap').mockResolvedValueOnce(err(HaiCacheError.OPERATION_FAILED, 'Test connection failure'))
  expect((await ops.refresh(refresh)).success).toBe(false)
  expect((await ops.verifyToken(created.data.accessToken)).success).toBe(true)
  expect((await ops.refresh(refresh)).success).toBe(true)
})

it('单设备候选提交失败不踢掉已有会话，失败候选不进入索引', async () => {
  const ops = await sessions(true)
  const created = await ops.create({ userId: 'failure-single' })
  if (!created.success)
    throw new Error(created.error.message)
  vi.spyOn(cache.kv, 'compareAndSwap').mockResolvedValueOnce(err(HaiCacheError.OPERATION_FAILED, 'Test connection failure'))
  expect((await ops.create({ userId: 'failure-single' })).success).toBe(false)
  expect((await ops.verifyToken(created.data.accessToken)).success).toBe(true)
  expect(await ops.deleteByUserId('failure-single')).toEqual({ success: true, data: 1 })
})
