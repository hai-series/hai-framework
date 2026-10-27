/** 生产模式反馈工作节点：真实共享后端，配置与材料只经测试 IPC 传递。 */
import process from 'node:process'
import { gzipSync } from 'node:zlib'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

const config = JSON.parse(process.env.FEEDBACK_PRODUCTION_FIXTURE)
core.init({ logging: { level: 'fatal' } })
function checked(result) {
  if (!result.success)
    throw new Error(String(result.error.code))
  return result.data
}
async function close() {
  await feedback.close()
  await iam.close()
  await audit.close()
  await storage.close()
  await cache.close()
  await reldb.close()
}
process.on('message', (message) => {
  void (async () => {
    if (message.action === 'run') {
      const result = await feedback.runJobs()
      process.send?.({ id: message.id, result })
    }
    else if (message.action === 'close') {
      await close()
      process.send?.({ id: message.id, result: { success: true } }, () => process.disconnect())
    }
  })().catch(() => process.send?.({ id: message.id, failed: true }))
})
async function main() {
  checked(await reldb.init(config.database))
  checked(await cache.init(config.cache))
  checked(await storage.init(config.storage))
  checked(await audit.init())
  checked(await iam.init({ seedDefaultData: false }))
  checked(await iam.auth.verifyToken(config.accessToken))
  checked(await feedback.init(config.feedback, { collectEvidence: async () => {
    process.send?.({ phase: 'business-started' })
    if (config.pauseBusiness)
      await new Promise(() => {})
    return { text: 'Production process business diagnostics', attachments: [{ id: 'diagnostics', name: 'diagnostics.gz', contentType: 'application/gzip', bytes: gzipSync('Stable cross-node diagnostic attachment') }] }
  } }))
  process.send?.({ phase: 'ready' })
}
void main().catch(async () => {
  process.send?.({ phase: 'failed' })
  process.exitCode = 1
  await close()
  process.disconnect()
})
