import { expect, it } from 'vitest'
import { createTransportBodyPolicy } from '../../src/transport/crypto-transport-body.js'

it('路由预算按完整段匹配，业务保留自身容量，大包不会占满小包准入', () => {
  const policy = createTransportBodyPolicy(1024, { '/api/files/*': 8 * 1024 * 1024 })
  expect(policy.maximum.plaintextBytes).toBe(8 * 1024 * 1024)
  const first = policy.acquire('/api/files/one')!
  const second = policy.acquire('/api/files/two')!
  expect(first.limits.plaintextBytes).toBe(8 * 1024 * 1024)
  expect(policy.acquire('/api/files/three')).toBeNull()
  const ordinary = policy.acquire('/api/orders')!
  expect(ordinary.limits.plaintextBytes).toBe(1024)
  const deeper = policy.acquire('/api/files/one/other')!
  expect(deeper.limits.plaintextBytes).toBe(1024)
  first.release()
  first.release()
  const replacement = policy.acquire('/api/files/three')!
  expect(policy.acquire('/api/files/four')).toBeNull()
  second.release()
  replacement.release()
  ordinary.release()
  deeper.release()
})

it.each(['https://example.test/api', '/api/foo*', '/api/**', '/api/path?q=1'])('拒绝非完整路径模式 %s', (path) => {
  expect(() => createTransportBodyPolicy(undefined, { [path]: 1024 })).toThrow(RangeError)
})

it('宿主显式提升普通业务容量后仍保留独立业务并发，不被辅助限额压到两个', () => {
  const policy = createTransportBodyPolicy(8 * 1024 * 1024, { '/api/feedback/*': 16 * 1024 * 1024 })
  const ordinary = Array.from({ length: 16 }, () => policy.acquire('/api/orders'))
  expect(ordinary.every(Boolean)).toBe(true)
  expect(policy.acquire('/api/orders')).toBeNull()
  const auxiliary = policy.acquire('/api/feedback/file')
  expect(auxiliary).not.toBeNull()
  for (const lease of ordinary)
    lease?.release()
  auxiliary?.release()
})
