import { parentPort } from 'node:worker_threads'
import { inflateRawSync } from 'node:zlib'
import { strFromU8, zipSync } from 'fflate'

/**
 * 视频采集包解压或项目打包任务。
 * @example 模块内部上下文
 * ```ts
 * const input: VideoArchiveJob = { type: 'pack', files: { 'story.txt': new Uint8Array([65]) } }
 * ```
 */
export type VideoArchiveJob
  = | { type: 'read', bytes: Uint8Array }
    | { type: 'pack', files: Record<string, Uint8Array> }

/**
 * 数据格式错误在当前任务内结算，便于后续任务复用线程。
 * @example 模块内部上下文
 * ```ts
 * const invalid: VideoArchiveReply = { type: 'invalid' }
 * ```
 */
export type VideoArchiveReply
  = | { type: 'files', files: Record<string, Uint8Array> }
    | { type: 'zip', bytes: Uint8Array }
    | { type: 'invalid' }

/** 在解压前扫描 ZIP 中央目录，拒绝链接、加密、ZIP64 和越界声明。 */
function validateArchive(bytes: Uint8Array): { name: string, compression: number, size: number, start: number, end: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054B50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
      end = offset
      break
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    throw new Error('Unsupported archive directory')
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  const directoryStart = offset
  const directoryEnd = offset + directorySize
  if (count < 1 || count > 256 || count !== view.getUint16(end + 8, true) || directoryEnd !== end)
    throw new Error('Archive directory exceeds its bound')
  let expanded = 0
  const names = new Set<string>()
  const entries: { name: string, compression: number, size: number, start: number, end: number }[] = []
  const ranges: { start: number, end: number }[] = []
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014B50)
      throw new Error('Invalid archive directory entry')
    const flags = view.getUint16(offset + 8, true)
    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const entryLength = 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    const mode = view.getUint32(offset + 38, true) >>> 16
    if (offset + entryLength > directoryEnd || flags & 1 || (compression !== 0 && compression !== 8)
      || compressedSize > 50 * 1024 * 1024 || size > 50 * 1024 * 1024 || (mode & 0xF000) === 0xA000 || view.getUint16(offset + 34, true) !== 0) {
      throw new Error('Unsupported archive entry')
    }
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength), !(flags & 0x800))
    expanded += size
    if (expanded > 100 * 1024 * 1024 || names.has(name) || name.startsWith('/') || /\\|\0|(?:^|\/)\.{1,2}(?:\/|$)|^[a-z]:/i.test(name))
      throw new Error('Unsafe archive path or expanded size')
    const local = view.getUint32(offset + 42, true)
    if (local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034B50
      || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== compression) {
      throw new Error('Archive local header mismatch')
    }
    const localNameLength = view.getUint16(local + 26, true)
    const start = local + 30 + localNameLength + view.getUint16(local + 28, true)
    const end = start + compressedSize
    if (end > directoryStart || strFromU8(bytes.subarray(local + 30, local + 30 + localNameLength), !(flags & 0x800)) !== name
      || (compression === 0 && size !== compressedSize)
      || (!(flags & 8) && (view.getUint32(local + 18, true) !== compressedSize || view.getUint32(local + 22, true) !== size))) {
      throw new Error('Archive entry length mismatch')
    }
    ranges.push({ start: local, end })
    entries.push({ name, compression, size, start, end })
    names.add(name)
    offset += entryLength
  }
  if (offset !== directoryEnd)
    throw new Error('Archive directory length mismatch')
  ranges.sort((left, right) => left.start - right.start)
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end))
    throw new Error('Archive entries overlap')
  return entries
}

/** 先核对目录和声明大小，再解压所需 JSON 与截图；不导入网站脚本或样式。 */
function readCapture(bytes: Uint8Array) {
  if (bytes.byteLength > 50 * 1024 * 1024)
    throw new Error('Capture archive exceeds its bound')
  const entries = validateArchive(bytes)
  const files: Record<string, Uint8Array> = {}
  for (const entry of entries) {
    if (entry.name !== 'capture.json' && entry.name !== 'extracted/tokens.json' && !/^screenshots\/[\w./-]+\.png$/i.test(entry.name))
      continue
    const compressed = bytes.subarray(entry.start, entry.end)
    // 原始声明与实际解压长度都受限，不能仅信任 ZIP 头中的 originalSize。
    const output = entry.compression === 0
      ? compressed.slice()
      : inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, entry.size),
        })
    if (output.byteLength !== entry.size)
      throw new Error('Archive expanded size mismatch')
    files[entry.name] = output
  }
  return files
}

parentPort?.on('message', (job: VideoArchiveJob) => {
  try {
    if (job.type === 'read') {
      const files = readCapture(job.bytes)
      parentPort?.postMessage({ type: 'files', files } satisfies VideoArchiveReply)
    }
    else {
      const bytes = zipSync(job.files, {
        level: 6,
        mtime: new Date('2000-01-01T00:00:00Z'),
      })
      parentPort?.postMessage({ type: 'zip', bytes } satisfies VideoArchiveReply, [bytes.buffer as ArrayBuffer])
    }
  }
  catch {
    parentPort?.postMessage({ type: 'invalid' } satisfies VideoArchiveReply)
  }
})
