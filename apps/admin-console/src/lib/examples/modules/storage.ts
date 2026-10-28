import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import { storage } from '@h-ai/storage'

// root 由启动配置传入；不要将用户输入直接作为本地根目录。
export async function storeFileExample(root: string) {
  const initialized = await storage.init({ type: 'local', root })
  if (!initialized.success)
    return initialized
  try {
    const saved = await storage.file.put('example/report.txt', Buffer.from('Example report'), { contentType: 'text/plain' })
    if (!saved.success)
      return saved
    // local 不支持预签名 URL；下载路由先鉴权，再读取文件。
    return await storage.file.get(saved.data.key)
  }
  finally {
    const closed = await storage.close()
    if (!closed.success)
      core.logger.error('Example storage cleanup failed', { error: closed.error })
  }
}
