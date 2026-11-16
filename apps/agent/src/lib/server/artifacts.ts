import type { DmlOperations } from '@h-ai/reldb'
import type { DownloadOptions } from '@h-ai/storage'
import type { AgentResource } from '#lib/workspace.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { z } from 'zod'
import { insertResource, missing, resource, stored, value, withResource, WorkspaceError, writeResource } from './data.js'

const versions = 'hai_agent_resource_versions'
const text = { type: 'TEXT', notNull: true } as const
const editable = new Set(['markdown', 'html', 'table', 'chart'])
const kinds = z.enum([
  'markdown',
  'html',
  'table',
  'chart',
  'image',
  'audio',
  'video',
  'file',
])
const mimeTypes: Record<z.infer<typeof kinds>, string> = {
  markdown: 'text/markdown',
  html: 'text/html',
  table: 'application/json',
  chart: 'application/json',
  image: 'image/png',
  audio: 'audio/mpeg',
  video: 'video/mp4',
  file: 'application/octet-stream',
}
const inputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(160).refine(title => !/[\uD800-\uDFFF]/u.test(title) && [...title].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)),
  kind: kinds,
  content: z.union([
    z.string(),
    z.instanceof(Uint8Array),
  ]),
  mediaType: z.string().max(120).optional(),
})

interface VersionRecord { ref: AgentResource, key: string, checksum: string }

export interface ArtifactInput {
  id?: string
  title: string
  kind: NonNullable<AgentResource['artifactKind']>
  content: string | Uint8Array
  mediaType?: string
}

function normalize(input: ArtifactInput) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new WorkspaceError(422, 'invalid-artifact')
  const data = parsed.data
  const bytes = typeof data.content === 'string'
    ? Buffer.from(data.content, 'utf8')
    : Buffer.from(data.content)
  const mediaType = data.mediaType ?? mimeTypes[data.kind]
  if (bytes.length > (editable.has(data.kind)
    ? 1024 * 1024
    : 50 * 1024 * 1024)) {
    throw new WorkspaceError(422, 'artifact-size')
  }
  if (editable.has(data.kind)) {
    if (mediaType !== mimeTypes[data.kind])
      throw new WorkspaceError(422, 'artifact-type')
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if ((data.kind === 'table' || data.kind === 'chart') && !z.record(z.string(), z.unknown()).safeParse(JSON.parse(content)).success)
        throw new Error('Invalid structured artifact')
    }
    catch { throw new WorkspaceError(422, 'artifact-type') }
  }
  const header = bytes.subarray(0, 16)
  const signature = (hex: string, offset = 0) => header.subarray(offset, offset + hex.length / 2).toString('hex') === hex
  const formats: Record<string, boolean> = {
    'image/png': signature('89504e470d0a1a0a'),
    'image/jpeg': signature('ffd8ff'),
    'image/gif': /^GIF8[79]a$/u.test(header.subarray(0, 6).toString()),
    'image/webp': signature('52494646') && signature('57454250', 8),
    'audio/mpeg': signature('494433') || (header[0] === 255 && (header[1] & 224) === 224),
    'audio/wav': signature('52494646') && signature('57415645', 8),
    'audio/ogg': signature('4f676753'),
    'audio/webm': signature('1a45dfa3'),
    'video/mp4': signature('66747970', 4),
    'video/webm': signature('1a45dfa3'),
  }
  if (['image', 'audio', 'video'].includes(data.kind) && (!mediaType.startsWith(`${data.kind}/`) || !formats[mediaType]))
    throw new WorkspaceError(422, 'artifact-type')
  if (data.kind === 'file' && /^(?:text\/html|image\/svg\+xml)$/iu.test(mediaType))
    throw new WorkspaceError(422, 'artifact-type')
  return {
    ...data,
    bytes,
    mediaType,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function version(user: string, id: string, number: number, sql: DmlOperations = reldb.sql) {
  const row = value(await sql.get<{ data: string | VersionRecord }>(`SELECT data FROM ${versions} WHERE owner = ? AND resource_id = ? AND version = ?`, [user, id, number]))
  return row
    ? stored<VersionRecord>(row.data)
    : missing()
}

async function record(user: string, snapshot: VersionRecord, sql: DmlOperations) {
  value(await sql.execute(`INSERT INTO ${versions} (id, owner, resource_id, version, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`, [
    `${snapshot.ref.id}:${snapshot.ref.version}`,
    user,
    snapshot.ref.id,
    snapshot.ref.version,
    snapshot.ref.updatedAt,
    JSON.stringify(snapshot),
  ]))
}

async function discardUnpublished(key: string, user: string, id: string, number: number) {
  // 提交结果不明时先检查引用；数据库不可用则保留对象，避免删除已经提交的产物。
  const row = await reldb.sql.get<{ data: string | VersionRecord }>(`SELECT data FROM ${versions} WHERE owner = ? AND resource_id = ? AND version = ?`, [user, id, number])
  if (!row.success) {
    core.logger.warn('Artifact cleanup requires reconciliation', { module: 'agent', errorCode: row.error.code })
    return
  }
  if (row.data && stored<VersionRecord>(row.data.data).key === key)
    return
  const removed = await storage.file.delete(key)
  if (!removed.success)
    core.logger.warn('Artifact temporary object cleanup failed', { module: 'agent', errorCode: removed.error.code })
}

export const artifactStore = {
  prepare() {
    return reldb.prepareSchema('hai:agent:artifact-schema', async ({ ddl }) => {
      const created = await ddl.createTable(versions, {
        id: { ...text, primaryKey: true },
        owner: text,
        resource_id: text,
        version: { type: 'INTEGER', notNull: true },
        created_at: { type: 'BIGINT', notNull: true },
        data: { type: 'JSON', notNull: true },
      })
      if (!created.success)
        return created
      return ddl.createIndex(versions, `${versions}_owner_idx`, {
        columns: ['owner', 'resource_id', 'version'],
        unique: true,
      })
    })
  },
  async create(user: string, input: ArtifactInput): Promise<AgentResource> {
    const normalized = normalize(input)
    const id = normalized.id ?? randomUUID()
    const now = Date.now()
    const ref: AgentResource = {
      id,
      kind: 'artifact',
      title: normalized.title,
      artifactKind: normalized.kind,
      mediaType: normalized.mediaType,
      version: 1,
      size: normalized.bytes.length,
      createdAt: now,
      updatedAt: now,
    }
    const key = `agent/${createHash('sha256').update(user).digest('hex')}/artifacts/${id}/${randomUUID()}`
    value(await storage.file.put(key, normalized.bytes, { ifNoneMatch: '*', contentType: normalized.mediaType }))
    let published = false
    try {
      const transaction = value(await reldb.tx.begin())
      let committed = false
      try {
        let result = ref
        if (await insertResource(user, ref, transaction)) {
          await record(user, { ref, key, checksum: normalized.checksum }, transaction)
        }
        else {
          await resource(user, id, 'artifact', transaction)
          const prior = await version(user, id, 1, transaction)
          if (prior.checksum !== normalized.checksum || prior.ref.title !== ref.title || prior.ref.artifactKind !== ref.artifactKind || prior.ref.mediaType !== ref.mediaType)
            throw new WorkspaceError(409, 'artifact-conflict', prior.ref.version)
          result = prior.ref
        }
        value(await transaction.commit())
        committed = true
        published = result === ref
        return result
      }
      finally {
        if (!committed) {
          const rolledBack = await transaction.rollback()
          if (!rolledBack.success)
            core.logger.error('Artifact creation rollback failed', { module: 'agent', errorCode: rolledBack.error.code })
        }
      }
    }
    finally {
      if (!published)
        await discardUnpublished(key, user, id, 1)
    }
  },
  async describe(user: string, id: string, number?: number): Promise<AgentResource> {
    const current = await resource(user, id, 'artifact')
    return (await version(user, id, number ?? current.version ?? 1)).ref
  },
  async read(user: string, id: string, number?: number): Promise<{ ref: AgentResource, bytes: Uint8Array }> {
    const current = await resource(user, id, 'artifact')
    const snapshot = await version(user, id, number ?? current.version ?? 1)
    const bytes = value(await storage.file.get(snapshot.key))
    if (createHash('sha256').update(bytes).digest('hex') !== snapshot.checksum)
      throw new WorkspaceError(422, 'artifact-integrity')
    return { ref: snapshot.ref, bytes }
  },
  async stream(user: string, id: string, number: number | undefined, options: DownloadOptions) {
    const current = await resource(user, id, 'artifact')
    const snapshot = await version(user, id, number ?? current.version ?? 1)
    const source = value(await storage.file.getStream(snapshot.key, options))
    async function* verified() {
      const checksum = createHash('sha256')
      let count = 0
      for await (const chunk of source) {
        checksum.update(chunk)
        count += chunk.byteLength
        yield chunk
      }
      // 部分下载只核验请求区间；完整下载在流结束前核对保存时的摘要。
      if (options.rangeStart === undefined && options.rangeEnd === undefined
        && (count !== snapshot.ref.size || checksum.digest('hex') !== snapshot.checksum)) {
        throw new WorkspaceError(422, 'artifact-integrity')
      }
    }
    return {
      ref: snapshot.ref,
      chunks: verified(),
    }
  },
  async save(user: string, input: { id: string, baseVersion: number, content: string }): Promise<AgentResource> {
    if (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 1 || input.baseVersion >= 1_000_000)
      throw new WorkspaceError(422, 'invalid-artifact')
    // 首次读取只用于验证类型和创建不可变对象，提交时必须在行锁内重新核对版本。
    const current = await resource(user, input.id, 'artifact')
    if (!current.artifactKind || !editable.has(current.artifactKind))
      throw new WorkspaceError(422, 'artifact-readonly')
    const normalized = normalize({
      title: current.title,
      kind: current.artifactKind,
      mediaType: current.mediaType,
      content: input.content,
    })
    const number = input.baseVersion + 1
    const key = `agent/${createHash('sha256').update(user).digest('hex')}/artifacts/${input.id}/${randomUUID()}`
    value(await storage.file.put(key, normalized.bytes, { ifNoneMatch: '*', contentType: normalized.mediaType }))
    let published = false
    try {
      const saved = await withResource(user, input.id, async (locked, sql) => {
        if (locked.version !== input.baseVersion)
          throw new WorkspaceError(409, 'artifact-conflict', locked.version)
        const ref = {
          ...locked,
          version: number,
          size: normalized.bytes.length,
          updatedAt: Date.now(),
        }
        await record(user, { ref, key, checksum: normalized.checksum }, sql)
        await writeResource(user, ref, sql)
        return ref
      })
      published = true
      return saved
    }
    finally {
      if (!published)
        await discardUnpublished(key, user, input.id, number)
    }
  },
  async history(user: string, id: string): Promise<AgentResource[]> {
    await resource(user, id, 'artifact')
    const rows = value(await reldb.sql.query<{ data: string | VersionRecord }>(`SELECT data FROM ${versions} WHERE owner = ? AND resource_id = ? ORDER BY version DESC LIMIT 100`, [user, id]))
    return rows.map(row => stored<VersionRecord>(row.data).ref)
  },
}
