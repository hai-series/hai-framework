import process from 'node:process'
/** 两个独立 Node 进程共享 Redis registry；私钥只通过私有 IPC 装配。 */
import { cache } from '@h-ai/cache'
import { authenticateTransportRequest, createCacheTransportKeyStore, crypto } from '@h-ai/crypto'

let manager
let handled = 0
process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      const initialized = await crypto.init()
      const connected = await cache.init(message.config)
      if (!initialized.success || !connected.success)
        throw new Error('Worker initialization failed')
      const result = crypto.transport.createServer({
        serverKeyRing: message.serverKeyRing,
        keyStore: createCacheTransportKeyStore({ cache }),
      })
      if (!result.success)
        throw new Error('Worker manager initialization failed')
      manager = result.data
      process.send?.({ id: message.id, success: true })
    }
    else if (message.type === 'request') {
      const verified = await authenticateTransportRequest(manager, new Request(message.url, message.init))
      if (verified.success) {
        handled++
        const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ handled }), 200)
        process.send?.({ id: message.id, success: encrypted.success, handled })
      }
      else {
        process.send?.({ id: message.id, success: false, handled })
      }
    }
    else if (message.type === 'close') {
      await cache.close()
      await crypto.close()
      process.disconnect()
    }
  }
  catch { process.send?.({ id: message.id, success: false, error: 'Transport worker operation failed' }) }
})
process.on('disconnect', async () => {
  await cache.close()
  await crypto.close()
})
