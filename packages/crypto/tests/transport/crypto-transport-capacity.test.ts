import { describe, expect, it } from 'vitest'
import { resolveTransportBodyLimits, TRANSPORT_BODY_LIMITS, TransportBodyTooLargeError } from '../../src/index.js'
import { readTransportBody } from '../../src/transport/crypto-transport-body.js'

describe('transport capacity configuration', () => {
  it('保持默认预算并自动推导 8 MiB 明文的密文预算，安全预算独立', () => {
    expect(resolveTransportBodyLimits()).toEqual(TRANSPORT_BODY_LIMITS)
    expect(resolveTransportBodyLimits(8 * 1024 * 1024)).toEqual({
      ...TRANSPORT_BODY_LIMITS,
      plaintextBytes: 8 * 1024 * 1024,
      encryptedPayloadBytes: 16 * 1024 * 1024 + 32768,
    })
    expect(Object.isFrozen(resolveTransportBodyLimits())).toBe(true)
  })

  it.each([0, -1, 1023, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 64 * 1024 * 1024 + 1, '8388608', null])('拒绝无效容量 %s', (limit) => {
    // 未知配置入口须执行运行时校验，不能仅依赖静态类型。
    expect(() => resolveTransportBodyLimits(limit as number)).toThrow(RangeError)
  })

  it.each([1024, 64 * 1024 * 1024])('接受有效范围边界 %s', (limit) => {
    expect(resolveTransportBodyLimits(limit).plaintextBytes).toBe(limit)
  })

  it('超限错误包含稳定码、方向、阶段和实际字节，释放原流', async () => {
    const stream = new Response('你'.repeat(342)).body!
    await expect(readTransportBody(stream, { maxBytes: 1024, direction: 'response', stage: 'plaintext' })).rejects.toMatchObject({
      code: 'hai:crypto:070',
      direction: 'response',
      stage: 'plaintext',
      limitBytes: 1024,
      actualBytes: 1026,
    })
    expect(stream.locked).toBe(false)
    expect(new TransportBodyTooLargeError(1024, 1025)).toBeInstanceOf(RangeError)
  })
})
