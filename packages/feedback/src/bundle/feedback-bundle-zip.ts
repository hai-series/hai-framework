import type { FeedbackBundleReadOptions } from './feedback-bundle-types.js'
import { strFromU8, unzipSync, zipSync } from 'fflate'

/**
 * 已经准备好的 ZIP 文件，或需在解压前执行容量和路径校验的归档。
 * @example 模块内部上下文
 * ```ts
 * const pack: BundleArchiveJob = { type: 'pack', files: { 'report.json': new Uint8Array() } }
 * ```
 */
export type BundleArchiveJob
  = | { type: 'pack', files: Record<string, Uint8Array> }
    | { type: 'read', bytes: Uint8Array, limits: Required<FeedbackBundleReadOptions> }

/**
 * 压缩、解压或校验失败结果。
 * @example 模块内部上下文
 * ```ts
 * const failed: BundleArchiveReply = { type: 'invalid' }
 * ```
 */
export type BundleArchiveReply
  = | { type: 'zip', bytes: Uint8Array }
    | { type: 'files', files: Record<string, Uint8Array> }
    | { type: 'invalid' }

/**
 * 检查归档内相对路径。
 * @example 模块内部上下文
 * ```ts
 * const allowed = safePath('evidence/records.json')
 * ```
 */
export function safePath(value: string): boolean {
  return /^[a-z0-9][\w./-]*$/i.test(value) && !value.endsWith('/')
    && !value.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

/** 先检查 ZIP 中央目录，避免解压后才发现重复路径、符号链接或压缩炸弹。 */
function preflight(bytes: Uint8Array, limits: Required<FeedbackBundleReadOptions>): void {
  if (bytes.byteLength > limits.maxBytes || bytes.byteLength < 22)
    throw new Error('Invalid archive size')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054B50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
      end = offset
      break
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    throw new Error('Invalid archive directory')
  const count = view.getUint16(end + 10, true)
  const size = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  if (count === 0 || count > limits.maxFiles || count !== view.getUint16(end + 8, true) || offset + size !== end)
    throw new Error('Invalid archive directory size')
  let total = 0
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014B50)
      throw new Error('Invalid archive entry')
    const nameLength = view.getUint16(offset + 28, true)
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    if (next > end)
      throw new Error('Invalid archive entry length')
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength))
    const originalSize = view.getUint32(offset + 24, true)
    const method = view.getUint16(offset + 10, true)
    const mode = (view.getUint32(offset + 38, true) >>> 16) & 0xF000
    if (!safePath(name) || names.has(name.toLowerCase()) || originalSize > limits.maxFileBytes
      || (view.getUint16(offset + 8, true) & 1) || ![0, 8].includes(method) || (mode !== 0 && mode !== 0x8000)) {
      throw new Error('Unsafe archive entry')
    }
    total += originalSize
    if (total > limits.maxBytes)
      throw new Error('Archive expansion limit')
    names.add(name.toLowerCase())
    offset = next
  }
  if (offset !== end)
    throw new Error('Unexpected archive entry')
}

/**
 * 在同一次任务中校验并解压归档，或按固定元数据压缩。
 * @example 模块内部上下文
 * ```ts
 * const result = handleBundleArchive({ type: 'pack', files: { 'report.json': new Uint8Array() } })
 * if (result.type === 'zip') void result.bytes
 * ```
 */
export function handleBundleArchive(job: BundleArchiveJob): BundleArchiveReply {
  try {
    if (job.type === 'pack') {
      return {
        type: 'zip',
        bytes: zipSync(job.files, {
          level: 1,
          mtime: new Date(1980, 0, 1),
        }),
      }
    }

    preflight(job.bytes, job.limits)
    return {
      type: 'files',
      files: unzipSync(job.bytes),
    }
  }
  catch {
    return { type: 'invalid' }
  }
}

/**
 * 归档输出的缓冲区只供接收方使用；同一底层缓冲区只转移一次。
 * @example 模块内部上下文
 * ```ts
 * const buffers = archiveTransfers({ type: 'zip', bytes: new Uint8Array(2) })
 * ```
 */
export function archiveTransfers(reply: BundleArchiveReply): ArrayBuffer[] {
  const buffers = reply.type === 'zip'
    ? [reply.bytes.buffer]
    : reply.type === 'files'
      ? Object.values(reply.files).map(bytes => bytes.buffer)
      : []
  return [
    ...new Set(buffers.filter(buffer => buffer instanceof ArrayBuffer)),
  ]
}
