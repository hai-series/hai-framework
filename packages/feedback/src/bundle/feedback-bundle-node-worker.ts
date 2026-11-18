import type { BundleArchiveJob } from './feedback-bundle-zip.js'
import { parentPort } from 'node:worker_threads'
import { archiveTransfers, handleBundleArchive } from './feedback-bundle-zip.js'

parentPort?.on('message', (job: BundleArchiveJob) => {
  const result = handleBundleArchive(job)
  parentPort?.postMessage(result, archiveTransfers(result))
})
