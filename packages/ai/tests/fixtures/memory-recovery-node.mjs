import process from 'node:process'
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

let databaseType

function take(result) {
  if (!result.success)
    throw new Error(result.error.code)
  return result.data
}

async function count(table) {
  const result = await reldb.sql.get(`SELECT COUNT(*) AS count FROM ${table}`)
  return result.success
    ? {
        ...result,
        data: Number(result.data?.count ?? 0),
      }
    : result
}

function expiry(retire = false) {
  if (databaseType === 'mysql')
    return retire ? 'JSON_SET(data, \'$.updatedAt\', 1, \'$.retireUntil\', 1)' : 'JSON_SET(data, \'$.updatedAt\', 1)'
  return retire
    ? 'jsonb_set(jsonb_set(data, \'{updatedAt}\', \'1\'::jsonb), \'{retireUntil}\', \'1\'::jsonb)'
    : 'jsonb_set(data, \'{updatedAt}\', \'1\'::jsonb)'
}

let closing
function close() {
  closing ??= (async () => {
    try {
      await ai.close()
    }
    finally {
      take(await vecdb.close())
      take(await reldb.close())
    }
  })()
  return closing
}

const operations = {
  async init({ database, url, node, maxEntriesPerObject }) {
    take(await reldb.init(database))
    databaseType = database.type
    take(await vecdb.init({ type: 'qdrant', url: `${url}/vector/${node}` }))
    take(await ai.init({
      llm: {
        apiKey: 'fixture-only',
        baseUrl: `${url}/model`,
        scenarios: { embedding: 'fixture-embedding' },
      },
      embedding: { dimensions: 2 },
      memory: { maxEntriesPerObject },
    }))
  },
  add({ owner, content }) {
    return ai.memory.scoped({ objectId: owner }).add({ content, type: 'fact' })
  },
  get({ owner, id }) {
    return ai.memory.scoped({ objectId: owner }).get(id)
  },
  list({ owner }) {
    return ai.memory.scoped({ objectId: owner }).list()
  },
  recall({ owner, content, topK }) {
    return ai.memory.scoped({ objectId: owner }).recall(content, { topK, candidateMultiplier: 1, recencyWeight: 0 })
  },
  update({ owner, id, content }) {
    return ai.memory.scoped({ objectId: owner }).update(id, { content })
  },
  remove({ owner, id }) {
    return ai.memory.scoped({ objectId: owner }).remove(id)
  },
  clear({ owner }) {
    return ai.memory.scoped({ objectId: owner }).clear()
  },
  seedLegacyMemory({ id }) {
    return reldb.sql.execute(
      'INSERT INTO hai_ai_memory (id, object_id, version, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        'alice',
        'legacy-fixture',
        JSON.stringify({
          id,
          objectId: 'alice',
          content: 'Legacy Alice memory',
          type: 'fact',
          importance: 0.5,
          accessCount: 0,
          createdAt: 1,
          lastAccessedAt: 1,
          vector: [1, 0],
        }),
        1,
        1,
      ],
    )
  },
  executeDdl({ sql }) {
    return reldb.ddl.raw(sql)
  },
  expireVectorClaim({ memoryId }) {
    const subject = databaseType === 'mysql'
      ? 'JSON_UNQUOTE(JSON_EXTRACT(data, \'$.memoryId\'))'
      : 'data->>\'memoryId\''
    return reldb.sql.execute(`UPDATE hai_ai_memory_vector_outbox SET data = ${expiry()}, updated_at = 1 WHERE ${subject} = ?`, [memoryId])
  },
  expireVectorRetirement({ id }) {
    // 把旧版的 60 秒退役期限设为过去，保留其他向量作业的状态。
    return reldb.sql.execute(`UPDATE hai_ai_memory_vector_outbox SET data = ${expiry(true)}, updated_at = 1 WHERE id = ?`, [id])
  },
  expireVectorScan() {
    return reldb.sql.execute(`UPDATE hai_ai_memory_vector_scan SET data = ${expiry()}, updated_at = 1 WHERE id = ?`, ['scan'])
  },
  countVectorJobs() { return count('hai_ai_memory_vector_outbox') },
  countVectorScans() { return count('hai_ai_memory_vector_scan') },
  close,
}

process.on('message', async ({ id, method, input }) => {
  try {
    const output = await operations[method](input)
    process.send?.({ id, output })
  }
  catch (error) {
    process.send?.({
      id,
      error: error instanceof Error
        ? error.message
        : 'Memory fixture failed',
    })
  }
})

process.on('disconnect', () => {
  void close().then(() => process.exit(0), () => process.exit(1))
})
