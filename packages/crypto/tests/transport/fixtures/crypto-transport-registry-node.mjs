import process from 'node:process'
/** 独立 Node 缓存 registry worker；测试通过私有 IPC 装配 Redis 连接。 */
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'

let store
process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      if (message.clockOffsetMs) {
        const original = Date.now
        Date.now = () => original() + message.clockOffsetMs
      }
      const initialized = await crypto.init()
      const connected = await cache.init(message.config)
      if (!initialized.success || !connected.success)
        throw new Error('Worker initialization failed')
      store = crypto.transport.createKeyStore({
        cache,
        ttlSeconds: 3600,
        maxRegistrationsPerMinute: message.maxRegistrationsPerMinute,
        maxRequestsPerMinute: message.maxRequestsPerMinute,
      })
      process.send?.({ id: message.id, success: true })
    }
    else if (message.type === 'register') {
      process.send?.({ id: message.id, success: true, clientId: await store.register(message.publicKey) })
    }
    else if (message.type === 'get') {
      process.send?.({ id: message.id, success: true, publicKey: await store.get(message.clientId) })
    }
    else if (message.type === 'claim') {
      process.send?.({ id: message.id, success: true, claimed: await store.claimRequest(message.clientId, message.requestId, message.expiresAt) })
    }
    else if (message.type === 'close') {
      await cache.close()
      await crypto.close()
      process.disconnect()
    }
  }
  catch (error) {
    process.send?.({
      id: message.id,
      success: false,
      code: error instanceof Error && 'code' in error
        ? error.code
        : undefined,
    })
  }
})
process.on('disconnect', async () => {
  await cache.close()
  await crypto.close()
})
