import type { BundleArchiveJob } from './feedback-bundle-zip.js'
import { archiveTransfers, handleBundleArchive } from './feedback-bundle-zip.js'

globalThis.addEventListener('message', (event: MessageEvent<BundleArchiveJob>) => {
  const result = handleBundleArchive(event.data)
  globalThis.postMessage(result, {
    transfer: archiveTransfers(result),
  })
})
