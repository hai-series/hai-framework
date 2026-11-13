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
  executeDdl({ sql }) {
    return reldb.ddl.raw(sql)
  },
  expireVectorClaim({ memoryId }) {
    const updated = databaseType === 'mysql'
      ? 'JSON_SET(data, \'$.updatedAt\', 1)'
      : 'jsonb_set(data, \'{updatedAt}\', \'1\'::jsonb)'
    const subject = databaseType === 'mysql'
      ? 'JSON_UNQUOTE(JSON_EXTRACT(data, \'$.memoryId\'))'
      : 'data->>\'memoryId\''
    // 模拟存储端租约时间经过，避免测试依赖真实 45 秒等待。
    return reldb.sql.execute(`UPDATE hai_ai_memory_vector_outbox SET data = ${updated}, updated_at = 1 WHERE ${subject} = ?`, [memoryId])
  },
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
