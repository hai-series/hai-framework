/** 独立 Node registry worker；每个进程持有独立数据库连接，测试通过私有 IPC 调度。 */
import process from 'node:process'
import { createReldbTransportKeyStore, crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'

let store

process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      const initialized = await crypto.init()
      const database = await reldb.init(message.config)
      if (!initialized.success || !database.success)
        throw new Error('Worker initialization failed')
      store = createReldbTransportKeyStore({ reldb, maxClients: message.maxClients, ttlSeconds: 3600 })
      await store.get('warmup')
      process.send?.({ id: message.id, success: true })
    }
    else if (message.type === 'register') {
      process.send?.({ id: message.id, success: true, clientId: await store.register(message.publicKey) })
    }
    else if (message.type === 'get') {
      process.send?.({ id: message.id, success: true, publicKey: await store.get(message.clientId) })
    }
    else if (message.type === 'prune') {
      process.send?.({ id: message.id, success: true, removed: await store.pruneExpired() })
    }
    else if (message.type === 'claim') {
      process.send?.({ id: message.id, success: true, claimed: await store.claimRequest(message.clientId, message.requestId, message.expiresAt) })
    }
    else if (message.type === 'close') {
      await reldb.close()
      await crypto.close()
      process.disconnect()
    }
  }
  catch {
    process.send?.({ id: message.id, success: false })
  }
})

process.on('disconnect', async () => {
  await reldb.close()
  await crypto.close()
})
