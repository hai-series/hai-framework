import { vi } from 'vitest'

/** 三条日志路径共用的序列化陷阱，所有凭据均为测试数据。 */
export function createSerializationFixture() {
  const serialize = vi.fn(() => ({ password: 'serialized-only-secret' }))
  const readAccessor = vi.fn(() => 'accessor-only-secret')
  class SdkPayload {
    readonly token = 'class-only-secret'
    readonly label = 'sdk-visible'
    toJSON() { return serialize() }
  }
  const sdk = new SdkPayload()
  Object.defineProperty(sdk, 'detail', { get: readAccessor, enumerable: true })
  const plain = {
    password: 'plain-only-secret',
    customerId: 'customer-private',
    label: 'plain-visible',
    toJSON: serialize,
  }
  const timestamp = new Date('2026-01-01T00:00:00Z')
  Object.defineProperty(timestamp, 'toJSON', { value: serialize, configurable: true })
  const input = {
    plain,
    sdk,
    timestamp,
    items: [sdk, plain],
  }
  return { input, serialize, readAccessor }
}
