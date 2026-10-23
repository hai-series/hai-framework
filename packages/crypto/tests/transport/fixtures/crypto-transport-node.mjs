/** 两个独立 Node 进程共享 SQLite registry 的验收 worker；私钥只通过私有 IPC 装配。 */
import process from 'node:process'
import { authenticateTransportRequest, createReldbTransportKeyStore, crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'

let manager
let handled = 0

process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      const initialized = await crypto.init()
      const database = await reldb.init({ type: 'sqlite', database: message.database })
      if (!initialized.success || !database.success)
        throw new Error('Worker initialization failed')
      const keyStore = createReldbTransportKeyStore({ reldb })
      await keyStore.get(message.clientId)
      const server = crypto.transport.createServer({ serverKeyRing: message.serverKeyRing, keyStore })
      if (!server.success)
        throw new Error('Worker manager initialization failed')
      manager = server.data
      process.send?.({ type: 'ready' })
    }
    else if (message.type === 'request') {
      const result = await authenticateTransportRequest(manager, new Request(message.url, message.init))
      if (result.success) {
        // 只有共享原子 claim 成功后，业务处理器才会得到明文。
        handled++
        const response = await manager.encryptResponse(result.data.context, JSON.stringify({ handled }), 200)
        process.send?.({ id: message.id, success: response.success, handled })
      }
      else {
        process.send?.({ id: message.id, success: false, handled })
      }
    }
    else if (message.type === 'close') {
      await reldb.close()
      await crypto.close()
      process.disconnect()
    }
  }
  catch {
    process.send?.({ id: message.id, success: false, error: 'Transport worker operation failed' })
  }
})

process.on('disconnect', async () => {
  await reldb.close()
  await crypto.close()
})
