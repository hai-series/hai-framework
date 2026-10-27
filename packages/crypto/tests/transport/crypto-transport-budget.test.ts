import { describe, expect, it } from 'vitest'
import { resolveTransportBodyLimits } from '../../src/index.js'

describe('宿主与模块共用传输预算', () => {
  it('保留显式上限，缺省时才按模块需要推导', () => {
    expect(resolveTransportBodyLimits(25165824, { requiredPlaintextBytes: 11250348 }).encryptedPayloadBytes).toBe(50364416)
    expect(resolveTransportBodyLimits(undefined, { requiredPlaintextBytes: 11250348 }).plaintextBytes).toBe(11250348)
    expect(resolveTransportBodyLimits().plaintextBytes).toBe(1048576)
  })
  it('模块要求超过显式上限时拒绝，不静默扩大或缩小容量', () => {
    expect(() => resolveTransportBodyLimits(1048576, { requiredPlaintextBytes: 11250348 })).toThrow(RangeError)
    for (const value of [0, 1023, 67108865, Infinity, NaN])
      expect(() => resolveTransportBodyLimits(value, { requiredPlaintextBytes: 11250348 })).toThrow(RangeError)
    expect(() => resolveTransportBodyLimits(undefined, { requiredPlaintextBytes: 67108865 })).toThrow(RangeError)
  })
})
