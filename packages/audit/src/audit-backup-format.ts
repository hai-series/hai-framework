/** JSONL 归档格式与有界校验；不向在线审计表导入或覆盖数据。 */
import type { AuditBackupInfo } from './audit-types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { readAuditActor } from './audit-log-functions.js'
import { AUDIT_BACKUP_PREFIX } from './audit-types.js'

/**
 * 安全的稳定归档执行编号。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = backupIdSchema.safeParse('daily-archive')
 * ```
 */
export const backupIdSchema = z.string().regex(/^[a-z0-9][\w-]{0,127}$/i)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
/**
 * 可移植归档头；关联指纹用于同一执行复用核对。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const parsed = backupHeaderSchema.safeParse({ type: 'header', format: 'hai-audit', version: 1, id: 'preview', createdAt: new Date().toISOString(), cutoff: new Date().toISOString(), from: null, requestHash: 'a'.repeat(64) })
 * ```
 */
export const backupHeaderSchema = z.object({
  type: z.literal('header'),
  format: z.literal('hai-audit'),
  version: z.literal(1),
  id: backupIdSchema,
  createdAt: z.iso.datetime(),
  cutoff: z.iso.datetime(),
  from: z.iso.datetime().nullable(),
  requestHash: digestSchema,
})
const footerSchema = z.object({ type: z.literal('footer'), recordCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), sha256: digestSchema })
const entrySchema = z.object({ type: z.literal('entry'), record: z.object({ id: z.string().min(1), action: z.string().min(1), resource: z.string().min(1), createdAt: z.iso.datetime(), actorSnapshot: z.unknown().optional() }).passthrough() })

/**
 * 按字节限制每条记录，包含换行；过大时拒绝归档，不截断审计证据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const line = archiveLine({ type: 'footer', recordCount: 0, sha256: 'a'.repeat(64) }, 1024)
 * ```
 */
export function archiveLine(value: unknown, maxRecordBytes: number): Buffer {
  const encoded = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  if (encoded.byteLength > maxRecordBytes)
    throw new Error('Audit archive record exceeds size limit')
  return encoded
}

/** 分片中跨 UTF-8 字符或换行的输入也保持原始字节；无换行的大输入不会无限累计。 */
async function* lines(source: AsyncIterable<Uint8Array>, maxBytes: number, signal?: AbortSignal): AsyncGenerator<Buffer> {
  let fragments: Uint8Array[] = []
  let length = 0
  for await (const chunk of source) {
    signal?.throwIfAborted()
    const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    let offset = 0
    while (offset < buffer.byteLength) {
      const newline = buffer.indexOf(10, offset)
      const end = newline === -1 ? buffer.byteLength : newline + 1
      const part = buffer.subarray(offset, end)
      length += part.byteLength
      if (length > maxBytes)
        throw new Error('Audit archive record exceeds size limit')
      fragments.push(part)
      offset = end
      if (newline !== -1) {
        yield Buffer.concat(fragments, length)
        fragments = []
        length = 0
      }
    }
  }
  signal?.throwIfAborted()
  if (length !== 0)
    throw new Error('Audit archive is truncated')
}

/**
 * 内部流式读取器；格式/校验/读取错误由公开备份边界转为 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const header = archiveLine({ type: 'header', format: 'hai-audit', version: 1, id: 'preview', createdAt: new Date().toISOString(), cutoff: new Date().toISOString(), from: null, requestHash: 'a'.repeat(64) }, 1024)
 * const footer = archiveLine({ type: 'footer', recordCount: 0, sha256: createHash('sha256').update(header).digest('hex') }, 1024)
 * const content = (async function* () { yield header; yield footer })()
 * const verified = await verifyArchive(content, { key: `${AUDIT_BACKUP_PREFIX}preview.jsonl`, maxRecordBytes: 1024 })
 * ```
 */
export async function verifyArchive(source: AsyncIterable<Uint8Array>, options: { key: string, maxRecordBytes: number, signal?: AbortSignal }): Promise<{ info: AuditBackupInfo, requestHash: string }> {
  const hash = createHash('sha256')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let header: z.output<typeof backupHeaderSchema> | undefined
  let footer: z.output<typeof footerSchema> | undefined
  let count = 0
  for await (const line of lines(source, options.maxRecordBytes, options.signal)) {
    if (footer)
      throw new Error('Audit archive has trailing records')
    const value: unknown = JSON.parse(decoder.decode(line))
    if (!header) {
      header = backupHeaderSchema.parse(value)
      if (options.key !== `${AUDIT_BACKUP_PREFIX}${header.id}.jsonl`)
        throw new Error('Audit archive identity mismatch')
      hash.update(line)
      continue
    }
    const end = footerSchema.safeParse(value)
    if (end.success) {
      footer = end.data
      if (footer.recordCount !== count || footer.sha256 !== hash.digest('hex'))
        throw new Error('Audit archive checksum or count mismatch')
      continue
    }
    const entry = entrySchema.parse(value)
    readAuditActor(entry.record.actorSnapshot)
    if (!Number.isSafeInteger(++count))
      throw new Error('Audit archive record count exceeds safe range')
    hash.update(line)
  }
  if (!header || !footer)
    throw new Error('Audit archive is incomplete')
  return { info: { id: header.id, key: options.key, recordCount: footer.recordCount, sha256: footer.sha256, createdAt: new Date(header.createdAt), cutoff: new Date(header.cutoff) }, requestHash: header.requestHash }
}
