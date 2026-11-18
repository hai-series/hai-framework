import type { BundleArchiveJob, BundleArchiveReply } from './feedback-bundle-zip.js'
import { core } from '@h-ai/core'
import { handleBundleArchive } from './feedback-bundle-zip.js'

const hasWebWorker = typeof Worker !== 'undefined'
// eslint-disable-next-line node/prefer-global/process -- browser 子路径不加载 Node 内建模块。
const hasNodeWorker = Boolean(globalThis.process?.versions?.node)
const pool = core.worker.createPool<BundleArchiveJob, BundleArchiveReply>(
  hasWebWorker
    ? () => new Worker(new URL('./feedback-bundle-web-worker.js', import.meta.url), { type: 'module' })
    : new URL(import.meta.url.endsWith('.ts')
        ? '../../dist/feedback-bundle-node-worker.js'
        : './feedback-bundle-node-worker.js', import.meta.url),
  { maxWorkers: 1, maxQueuedJobs: 3, idleTimeoutMs: 15_000 },
)

function localBytes(bytes: Uint8Array): Uint8Array {
  // Node 宿主和 DOM 环境可能使用不同的 Uint8Array 原型。保留缓冲区，仅恢复当前空间的视图。
  return Object.getPrototypeOf(bytes) === Uint8Array.prototype
    ? bytes
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * 同一归档协议由 Node 线程池和浏览器 Web Worker 执行。
 * @example 模块内部上下文
 * ```ts
 * const reply = await bundleArchive({ type: 'pack', files: { 'report.json': new Uint8Array() } })
 * if (reply.type === 'zip') void reply.bytes
 * ```
 */
export async function bundleArchive(job: BundleArchiveJob): Promise<BundleArchiveReply> {
  if (!hasWebWorker && !hasNodeWorker)
    return handleBundleArchive(job)
  const result = await pool.run(job)
  if (!result.success)
    return { type: 'invalid' }
  const reply = result.data
  if (reply.type === 'zip') {
    return {
      type: 'zip',
      bytes: localBytes(reply.bytes),
    }
  }
  if (reply.type === 'files') {
    return {
      type: 'files',
      files: Object.fromEntries(Object.entries(reply.files).map(([path, bytes]) => [
        path,
        localBytes(bytes),
      ])),
    }
  }
  return reply
}
