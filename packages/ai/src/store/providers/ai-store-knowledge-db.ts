/**
 * Knowledge 的版本发布与跨存储补偿。
 * 文档正文、实体与当前版本在同一 CAS 清单中可见，vecdb 仅作为可重建的检索索引。
 * @module ai-store-knowledge-db
 */
import type { HaiResult } from '@h-ai/core'
import type { VecdbFunctions } from '@h-ai/vecdb'
import type { AIRelStore, KnowledgeDocumentRevision, KnowledgeStore } from '../ai-store-types.js'
import { createHash, randomUUID } from 'node:crypto'
import { HaiVecdbError } from '@h-ai/vecdb'

/**
 * 已发布快照不保存向量数组，避免同一向量在 SQL 和 vecdb 重复持久化。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const document: PublishedRevision = { documentId: 'doc-1', collection: 'docs', revision: 'revision-1', createdAt: Date.now(), chunks: [{ id: 'chunk-1', content: '指南', metadata: {} }], entities: [] }
 * const ids = document.chunks.map(chunk => chunk.id)
 * ```
 */
type PublishedRevision = Omit<KnowledgeDocumentRevision, 'chunks'> & {
  chunks: Array<Omit<KnowledgeDocumentRevision['chunks'][number], 'vector'>>
}

/**
 * 补偿记录在任何外部写入前持久化；abandoned 墓碑不能因一次删除成功就遗忘。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const garbage: GarbageRevision = { revision: 'old-revision', ids: ['old-chunk'], abandoned: true }
 * // abandoned 为永久墓碑：一次删除成功也不能让迟到 writer 重新发布。
 * const retainTombstone = garbage.abandoned
 * ```
 */
interface GarbageRevision {
  revision: string
  ids: string[]
  abandoned: boolean
}

/**
 * 每文档一个永久清单；删除保留墓碑，阻断旧 writer 的 missing ABA。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function nextManifest(store: AIRelStore<KnowledgeDocumentManifest>, current: KnowledgeDocumentManifest, document: PublishedRevision): Promise<KnowledgeDocumentManifest> {
 *   return { ...current, pending: { document, deadline: await store.currentTime() + 30_000 } }
 * }
 * // 最终发布仍须携带 readVersioned 读到的版本，并由存储原子核验期限。
 * ```
 */
export interface KnowledgeDocumentManifest {
  /** 集合、代际、文档 ID 的散列组合键。 */
  key: string
  /** 逻辑集合。 */
  collection: string
  /** 集合代际，删除后不复用。 */
  generation: string
  /** 业务文档 ID。 */
  documentId: string
  /** 已完整发布的正文与实体快照。 */
  current?: PublishedRevision
  /** 尚未可见的写入及存储时钟期限。 */
  pending?: { document: PublishedRevision, deadline: number }
  /** 外部索引补偿记录。 */
  garbage: GarbageRevision[]
}

/**
 * 集合删除也保留代际，重新 setup 不会重新显示上一代的数据。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const manifest: KnowledgeCollectionManifest = { collection: 'docs', dimension: 2, generation: randomUUID(), deleted: false }
 * const next = { ...manifest, generation: randomUUID() } // 重新建立集合不复用旧代际。
 * ```
 */
export interface KnowledgeCollectionManifest {
  /** 逻辑集合名。 */
  collection: string
  /** 固定向量维度。 */
  dimension: number
  /** 当前代际，删除后重新 setup 会更换。 */
  generation: string
  /** 集合是否已撤销可见性。 */
  deleted: boolean
}

/**
 * 内部依赖；只由默认 DB Provider 构造，不作为包公开 API。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function bind(deps: KnowledgeDbDependencies): KnowledgeDbDependencies {
 *   // prepare 归调用方装配，必须等待共享表就绪，不能把失败当作空集合。
 *   return { documents: deps.documents, collections: deps.collections, prepare: deps.prepare, vecdb: deps.vecdb }
 * }
 * ```
 */
interface KnowledgeDbDependencies {
  documents: AIRelStore<KnowledgeDocumentManifest>
  collections: AIRelStore<KnowledgeCollectionManifest>
  prepare: () => Promise<void>
  vecdb: VecdbFunctions
}

const WRITE_LEASE_MS = 300_000
const CAS_ATTEMPTS = 12

/** SQL/vecdb HaiResult 失败必须向上层传播，不能伪装为空或写入成功。 */
function required<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}

/** 组合键先编码再散列，避免文档/集合名中的分隔符产生碰撞。 */
function keyFor(...parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** 发布快照与暂存输入分离，调用方修改输入不能隐式更改已发布内容。 */
function snapshot(document: KnowledgeDocumentRevision): PublishedRevision {
  return structuredClone({ ...document, chunks: document.chunks.map(({ vector: _vector, ...chunk }) => chunk) })
}

/** 已完成的旧版本可以移除补偿记录；被遗弃的写入需保留永久墓碑。 */
function garbageFor(document: PublishedRevision, abandoned: boolean): GarbageRevision {
  return { revision: document.revision, ids: document.chunks.map(chunk => chunk.id), abandoned }
}

/**
 * 基于共享 RelStore CAS 实现 Knowledge 存储，不承诺 SQL 与 vecdb 的跨库事务。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function prepare(deps: KnowledgeDbDependencies) {
 *   const store = createDbKnowledgeStore(deps)
 *   await store.initialize('docs', 2)
 *   const recovery = await store.repair('docs', { offset: 0, limit: 100 })
 *   return { store, recovery }
 * }
 * ```
 */
export function createDbKnowledgeStore(deps: KnowledgeDbDependencies): KnowledgeStore {
  const { documents, collections, vecdb, prepare } = deps

  async function collectionState(collection: string): Promise<KnowledgeCollectionManifest> {
    const state = await collections.get(keyFor(collection))
    if (!state || state.deleted)
      throw new Error('Knowledge collection is not initialized')
    return state
  }

  async function visible(collection?: string): Promise<KnowledgeDocumentManifest[]> {
    const rows = await documents.query(collection ? { objectId: collection } : {})
    const states = new Map((await collections.query({})).map(state => [state.collection, state]))
    return rows.filter((row) => {
      const state = states.get(row.collection)
      return row.current && state && !state.deleted && state.generation === row.generation
    })
  }

  /** 先 CAS 撤销过期 owner，再删除外部索引，旧 owner 此后不能发布。 */
  async function detachExpired(key: string): Promise<void> {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await documents.readVersioned(key)
      if (!row?.data.pending || row.data.pending.deadline > await documents.currentTime())
        return
      const next = { ...row.data, pending: undefined, garbage: [...row.data.garbage, garbageFor(row.data.pending.document, true)] }
      if (await documents.compareAndSwap(key, { expectedVersion: row.version, data: next }))
        return
    }
    throw new Error('Knowledge recovery contention')
  }

  /** 删除失败保留清单；清理结果提交冲突时重读，不能覆盖新版本。 */
  async function cleanup(key: string): Promise<void> {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await documents.readVersioned(key)
      if (!row || row.data.garbage.length === 0)
        return
      const currentId = row.data.current?.revision
      const pendingId = row.data.pending?.document.revision
      const eligible = row.data.garbage.filter(item => item.revision !== currentId && item.revision !== pendingId)
      for (const garbage of eligible) {
        if (garbage.ids.length > 0)
          required(await vecdb.vector.delete(row.data.collection, garbage.ids))
      }
      const completed = new Set(eligible.filter(item => !item.abandoned).map(item => item.revision))
      if (completed.size === 0)
        return
      const next = { ...row.data, garbage: row.data.garbage.filter(item => !completed.has(item.revision)) }
      if (await documents.compareAndSwap(key, { expectedVersion: row.version, data: next }))
        return
    }
    throw new Error('Knowledge cleanup contention')
  }

  /** 正在进行的外部写入不可强行取消；永久墓碑用于后续重复清理迟到写入。 */
  async function abandon(key: string, revision: string): Promise<void> {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await documents.readVersioned(key)
      if (row?.data.pending?.document.revision !== revision)
        return
      const next = { ...row.data, pending: undefined, garbage: [...row.data.garbage, garbageFor(row.data.pending.document, true)] }
      if (await documents.compareAndSwap(key, { expectedVersion: row.version, data: next }))
        return
    }
    throw new Error('Knowledge abandonment contention')
  }

  async function removeManifest(documentId: string, collection: string, generationOverride?: string): Promise<void> {
    const generation = generationOverride ?? (await collectionState(collection)).generation
    const key = keyFor(collection, generation, documentId)
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await documents.readVersioned(key)
      if (!row)
        return
      const next = {
        ...row.data,
        current: undefined,
        pending: undefined,
        garbage: [...row.data.garbage, ...(row.data.current ? [garbageFor(row.data.current, false)] : []), ...(row.data.pending ? [garbageFor(row.data.pending.document, true)] : [])],
      }
      if (await documents.compareAndSwap(key, { expectedVersion: row.version, data: next })) {
        await cleanup(key)
        return
      }
    }
    throw new Error('Knowledge document removal contention')
  }

  const store: KnowledgeStore = {
    async initialize(collection, dimension) {
      await prepare()
      await store.ensureCollection(collection, dimension)
    },

    async replaceDocument(document) {
      const state = await collectionState(document.collection)
      const key = keyFor(document.collection, state.generation, document.documentId)
      await detachExpired(key)
      const previous = await documents.readVersioned(key)
      if (previous?.data.pending)
        throw new Error('Knowledge document is already being rebuilt')
      const published = snapshot(document)
      const pending = { document: published, deadline: await documents.currentTime() + WRITE_LEASE_MS }
      const manifest: KnowledgeDocumentManifest = {
        key,
        collection: document.collection,
        generation: state.generation,
        documentId: document.documentId,
        current: previous?.data.current,
        pending,
        garbage: previous?.data.garbage ?? [],
      }
      const claimVersion = await documents.compareAndSwap(key, {
        expectedVersion: previous?.version,
        data: manifest,
        scope: { objectId: document.collection, sessionId: state.generation },
      })
      if (!claimVersion)
        throw new Error('Knowledge document was concurrently modified')

      try {
        // 所有 ID 和清单已经持久化；部分成功、网络超时或进程崩溃均可恢复删除。
        if (document.chunks.length > 0)
          required(await vecdb.vector.upsert(document.collection, document.chunks))
        const liveCollection = await collectionState(document.collection)
        if (liveCollection.generation !== state.generation)
          throw new Error('Knowledge collection generation changed')
        const next: KnowledgeDocumentManifest = {
          ...manifest,
          current: published,
          pending: undefined,
          garbage: manifest.current ? [...manifest.garbage, garbageFor(manifest.current, false)] : manifest.garbage,
        }
        if (!await documents.compareAndSwap(key, { expectedVersion: claimVersion, data: next, notAfter: pending.deadline }))
          throw new Error('Knowledge document publication lease expired or was revoked')
      }
      catch (error) {
        // 发布结果不确定时必须先读当前清单；abandon 只撤销仍归本版本的 pending。
        try {
          await abandon(key, document.revision)
          await cleanup(key)
        }
        catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Knowledge staging failed; durable cleanup is pending')
        }
        throw error
      }
      try {
        await cleanup(key)
        return { cleanupPending: false }
      }
      catch {
        // 完整版本已经发布；不能谎称发布失败，也不能掩盖尚未完成的清理。
        return { cleanupPending: true }
      }
    },

    async repair(collection, options) {
      const page = await documents.queryPage({ objectId: collection, orderBy: { field: 'key', direction: 'asc' } }, { offset: options?.offset ?? 0, limit: options?.limit ?? 100 })
      const state = await collections.get(keyFor(collection))
      for (const row of page.items) {
        if (!state || state.deleted || row.generation !== state.generation) {
          // 已删除集合的旧 owner 也通过同一清单 CAS 撤销。
          await removeManifest(row.documentId, collection, row.generation)
        }
        else {
          await detachExpired(row.key)
          await cleanup(row.key)
        }
      }
      return { processed: page.items.length, total: page.total }
    },

    async findEntitiesByName(keyword, collection) {
      const needle = keyword.toLocaleLowerCase()
      return (await visible(collection)).flatMap(row => row.current!.entities).filter(entity => [entity.name, ...entity.aliases].some(value => value.toLocaleLowerCase().includes(needle))).map(({ id, name, type, aliases }) => ({ id, name, type, aliases }))
    },

    async listEntities(options) {
      const needle = options?.keyword?.toLocaleLowerCase()
      return (await visible(options?.collection)).flatMap(row => row.current!.entities.map(entity => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases,
        description: entity.description ?? null,
        createdAt: String(row.current!.createdAt),
        updatedAt: String(row.current!.createdAt),
      }))).filter(entity => (!options?.type || entity.type === options.type)
        && (!needle || [entity.name, ...entity.aliases].some(value => value.toLocaleLowerCase().includes(needle)))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, options?.limit)
    },

    async findDocumentsByEntityIds(ids, collection) {
      const wanted = new Set(ids)
      return (await visible(collection)).flatMap(row => row.current!.entities.filter(entity => wanted.has(entity.id))
        .flatMap(entity => entity.chunkIds.map(chunkId => ({
          entityId: entity.id,
          documentId: row.documentId,
          chunkId,
          collection: row.collection,
          relevance: 1,
          context: row.current!.chunks.find(chunk => chunk.id === chunkId)?.content.slice(0, 200) ?? null,
        }))))
    },

    async findByEntityName(name, options) {
      const needle = name.toLocaleLowerCase()
      // 实体和命中关系从同一份快照派生，不能在两次查询之间拼接不同 revision。
      return (await visible(options?.collection)).flatMap(row => row.current!.entities
        .filter(entity => (!options?.type || options.type === entity.type)
          && [entity.name, ...entity.aliases].some(value => value.toLocaleLowerCase().includes(needle)))
        .map(entity => ({
          entity: { id: entity.id, name: entity.name, type: entity.type, aliases: entity.aliases, description: entity.description ?? null },
          documents: entity.chunkIds.map(chunkId => ({
            documentId: row.documentId,
            chunkId,
            collection: row.collection,
            relevance: 1,
            context: row.current!.chunks.find(chunk => chunk.id === chunkId)?.content.slice(0, 200) ?? null,
          })),
        })))
    },

    async getDocument(documentId, collection) {
      const row = (await visible(collection)).find(item => item.documentId === documentId)
      return row?.current ? documentInfo(row.current) : undefined
    },

    async listDocuments(collection, options) {
      return (await visible(collection)).map(row => documentInfo(row.current!)).sort((a, b) => b.createdAt - a.createdAt || a.documentId.localeCompare(b.documentId)).slice(options?.offset ?? 0, options?.limit === undefined ? undefined : (options.offset ?? 0) + options.limit)
    },

    removeDocument: (documentId, collection) => removeManifest(documentId, collection),

    async searchVectors(collection, vector, options) {
      const topK = options?.topK ?? 10
      if (!Number.isSafeInteger(topK) || topK < 1 || topK > 10_000)
        throw new Error('Knowledge topK must be an integer between 1 and 10000')
      for (let attempt = 0; attempt < 4; attempt++) {
        // 查询前后核对同一批可见版本；清理与版本切换穿插时重试，不能返回空窗或混合版本。
        const before = await visible(collection)
        const signature = (rows: KnowledgeDocumentManifest[]) => JSON.stringify(rows.map(row => [row.key, row.current!.revision]).sort())
        const active = new Map(before.flatMap(row => row.current!.chunks.map(chunk => [chunk.id, chunk] as const)))
        let total = required(await vecdb.vector.count(collection))
        let requested = Math.min(Math.max(topK * 2, 1), Math.max(total, 1))
        let results: Awaited<ReturnType<KnowledgeStore['searchVectors']>> = []
        let complete = false
        for (let candidateRound = 0; candidateRound < 16; candidateRound++) {
          const hits = required(await vecdb.vector.search(collection, vector, { ...options, topK: requested }))
          results = hits.filter(hit => active.has(hit.id)).map((hit) => {
            const chunk = active.get(hit.id)!
            return { id: hit.id, score: hit.score, content: chunk.content, metadata: chunk.metadata }
          })
          if (results.length >= topK || hits.length < requested) {
            complete = true
            break
          }
          // 暂存写入可能发生在 count 和 search 之间；旧计数不能让新暂存挤掉全部可见结果。
          total = required(await vecdb.vector.count(collection))
          if (requested >= total) {
            complete = true
            break
          }
          requested = Math.min(total, requested * 2)
        }
        if (!complete)
          throw new Error('Knowledge candidate expansion limit reached; repair stale indexes and retry')
        if (signature(before) === signature(await visible(collection)))
          return results.slice(0, topK)
      }
      throw new Error('Knowledge publication changed repeatedly during retrieval; retry the read')
    },

    async ensureCollection(collection, dimension) {
      if (!required(await vecdb.collection.exists(collection))) {
        const result = await vecdb.collection.create(collection, { dimension })
        if (!result.success && result.error.code !== HaiVecdbError.COLLECTION_ALREADY_EXISTS.code)
          required(result)
      }
    },

    async registerCollection(collection, dimension) {
      const key = keyFor(collection)
      for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
        const row = await collections.readVersioned(key)
        if (row && !row.data.deleted) {
          if (row.data.dimension !== dimension)
            throw new Error('Knowledge collection dimension cannot be changed')
          return
        }
        if (await collections.compareAndSwap(key, {
          expectedVersion: row?.version,
          data: { collection, dimension, generation: randomUUID(), deleted: false },
        })) {
          return
        }
      }
      throw new Error('Knowledge collection setup contention')
    },

    async collectionExists(collection) {
      const state = await collections.get(keyFor(collection))
      return Boolean(state && !state.deleted)
    },

    async deleteCollection(collection) {
      const key = keyFor(collection)
      for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
        const row = await collections.readVersioned(key)
        if (!row)
          return
        if (row.data.deleted || await collections.compareAndSwap(key, { expectedVersion: row.version, data: { ...row.data, deleted: true } })) {
          // 先撤销可见性，再按页清理；只把当前页加载进内存，失败保留进度清单供 repair。
          let offset = 0
          while (true) {
            const page = await store.repair(collection, { offset, limit: 100 })
            offset += page.processed
            if (page.processed === 0 || offset >= page.total)
              break
          }
          return
        }
      }
      throw new Error('Knowledge collection deletion contention')
    },
  }
  return store
}

/** 可见文档元数据只从完整发布快照派生。 */
function documentInfo(document: PublishedRevision) {
  return {
    documentId: document.documentId,
    revision: document.revision,
    entityCount: document.entities.length,
    collection: document.collection,
    title: document.title ?? null,
    url: document.url ?? null,
    chunkCount: document.chunks.length,
    createdAt: document.createdAt,
  }
}
