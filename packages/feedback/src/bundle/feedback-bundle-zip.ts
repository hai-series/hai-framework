import type { FeedbackBundleReadOptions } from './feedback-bundle-types.js'
import { Inflate, strFromU8, zipSync } from 'fflate'

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
  return /^[a-z0-9]/i.test(value) && !/[^\w./-]/.test(value)
    && !value.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

/**
 * 单个归档条目经校验的数据范围，结束偏移不包含在内。
 * @example 模块内部上下文
 * ```ts
 * function storedContents(bytes: Uint8Array, entry: ZipEntry) { return bytes.subarray(entry.start, entry.end) }
 * ```
 */
interface ZipEntry {
  name: string
  method: number
  originalSize: number
  localHeader: number
  start: number
  end: number
}

/** 校验单盘 ZIP 目录及对应本地头；解压只读取已确认的字节区间。 */
function preflight(bytes: Uint8Array, limits: Required<FeedbackBundleReadOptions>): ZipEntry[] {
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
  const directoryOffset = view.getUint32(end + 16, true)
  if (count === 0 || count === 0xFFFF || count > limits.maxFiles || count !== view.getUint16(end + 8, true) || directoryOffset + size !== end)
    throw new Error('Invalid archive directory size')
  let offset = directoryOffset
  let total = 0
  const names = new Set<string>()
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014B50)
      throw new Error('Invalid archive entry')
    const nameLength = view.getUint16(offset + 28, true)
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    if (next > end)
      throw new Error('Invalid archive entry length')
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength))
    const flags = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const originalSize = view.getUint32(offset + 24, true)
    const method = view.getUint16(offset + 10, true)
    const mode = (view.getUint32(offset + 38, true) >>> 16) & 0xF000
    const localHeader = view.getUint32(offset + 42, true)
    if (!safePath(name) || names.has(name.toLowerCase()) || originalSize > limits.maxFileBytes
      || originalSize === 0xFFFFFFFF || (flags & 0x2041) || ![0, 8].includes(method)
      || (mode !== 0 && mode !== 0x8000) || view.getUint16(offset + 34, true) !== 0
      || (method === 0 && compressedSize !== originalSize) || (method === 8 && compressedSize === 0)) {
      throw new Error('Unsafe archive entry')
    }
    total += originalSize
    if (total > limits.maxBytes)
      throw new Error('Archive expansion limit')
    if (localHeader + 30 > directoryOffset || view.getUint32(localHeader, true) !== 0x04034B50
      || view.getUint16(localHeader + 6, true) !== flags || view.getUint16(localHeader + 8, true) !== method) {
      throw new Error('Invalid archive local header')
    }
    const localNameStart = localHeader + 30
    const localNameEnd = localNameStart + view.getUint16(localHeader + 26, true)
    const start = localNameEnd + view.getUint16(localHeader + 28, true)
    const dataEnd = start + compressedSize
    if (dataEnd > directoryOffset || name !== strFromU8(bytes.subarray(localNameStart, localNameEnd)))
      throw new Error('Invalid archive data range')
    // 流式 ZIP 的本地头允许省略校验数据，中央目录已声明待解压范围。
    if (!(flags & 8) && (view.getUint32(localHeader + 14, true) !== view.getUint32(offset + 16, true)
      || view.getUint32(localHeader + 18, true) !== compressedSize || view.getUint32(localHeader + 22, true) !== originalSize)) {
      throw new Error('Inconsistent archive sizes')
    }
    entries.push({
      name,
      method,
      originalSize,
      localHeader,
      start,
      end: dataEnd,
    })
    names.add(name.toLowerCase())
    offset = next
  }
  if (offset !== end)
    throw new Error('Unexpected archive entry')
  let previousEnd = 0
  for (const entry of entries.sort((left, right) => left.localHeader - right.localHeader)) {
    if (entry.localHeader < previousEnd)
      throw new Error('Overlapping archive entries')
    previousEnd = entry.end
  }
  return entries
}

function inflateEntry(compressed: Uint8Array, size: number): Uint8Array {
  const contents = new Uint8Array(size)
  let written = 0
  const inflater = new Inflate((chunk) => {
    if (written + chunk.byteLength > size)
      throw new Error('Archive entry exceeds its declared size')
    contents.set(chunk, written)
    written += chunk.byteLength
  })
  // 分块提供压缩输入，到达已审核的输出上限就停止处理。
  for (let offset = 0; offset < compressed.byteLength; offset += 4096) {
    const end = Math.min(compressed.byteLength, offset + 4096)
    inflater.push(compressed.subarray(offset, end), end === compressed.byteLength)
  }
  if (written !== size)
    throw new Error('Invalid uncompressed size')
  return contents
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

    const entries = preflight(job.bytes, job.limits)
    return {
      type: 'files',
      files: Object.fromEntries(entries.map((entry) => {
        const compressed = job.bytes.subarray(entry.start, entry.end)
        const contents = entry.method === 0
          ? new Uint8Array(compressed)
          : inflateEntry(compressed, entry.originalSize)
        return [entry.name, contents]
      })),
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
