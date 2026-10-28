/** 只在内部 Worker 执行现有同步镜像清理，不提供另一套删除算法。 */
import { parentPort, workerData } from 'node:worker_threads'
import { cleanupTestImages } from './cleanup-test-images.mjs'

if (!parentPort)
  throw new Error('Test image cleanup requires a worker parent')

try {
  parentPort.postMessage({ success: true, report: cleanupTestImages(workerData) })
}
catch (error) {
  parentPort.postMessage({ success: false, error: error instanceof Error ? error.message : 'Test image cleanup failed' })
}
finally {
  parentPort.close()
}
