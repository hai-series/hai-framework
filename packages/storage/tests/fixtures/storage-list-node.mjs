/** 全新 Node 进程从持久目录和不透明游标继续读取，不共享父进程状态。 */
import process from 'node:process'
import { storage } from '@h-ai/storage'

process.once('message', async ({ root, options }) => {
  let reply = { success: false }
  try {
    const initialized = await storage.init({ type: 'local', root })
    if (initialized.success) {
      const result = await storage.dir.list(options)
      if (result.success)
        reply = { success: true, keys: result.data.files.map(file => file.key), isTruncated: result.data.isTruncated }
    }
  }
  finally {
    const closed = await storage.close()
    process.send?.(closed.success ? reply : { success: false })
    process.disconnect()
  }
})
