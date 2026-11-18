import { expect, it } from 'vitest'
import { vecdb } from '../src/index.js'
import { acquirePgvectorContainer } from './helpers/pgvector-container.js'

it('pgvector preserves collection metrics and query ordering after the connection default changes', async () => {
  const lease = await acquirePgvectorContainer()
  const config = {
    type: 'pgvector' as const,
    host: lease.host,
    port: lease.port,
    database: lease.database,
    user: lease.user,
    password: lease.password,
    tablePrefix: 'metric_review_',
  }
  const names = ['cosine', 'euclidean', 'dot'] as const
  const bulk = 'worker_batch'
  try {
    expect((await vecdb.init({ ...config, metric: 'cosine' })).success).toBe(true)
    for (const metric of names) {
      expect((await vecdb.collection.create(metric, { dimension: 2, metric })).success).toBe(true)
      expect((await vecdb.vector.insert(metric, [
        {
          id: 'aligned',
          vector: [1, 0],
        },
        {
          id: 'large',
          vector: [3, 1],
        },
      ])).success).toBe(true)
    }
    expect((await vecdb.close()).success).toBe(true)
    expect((await vecdb.init({ ...config, metric: 'dot' })).success).toBe(true)
    for (const metric of names) {
      expect(await vecdb.collection.info(metric)).toMatchObject({
        success: true,
        data: { metric },
      })
      const found = await vecdb.vector.search(metric, [1, 0], { topK: 2 })
      expect(found.success).toBe(true)
      if (found.success) {
        expect(found.data[0].id).toBe(metric === 'dot'
          ? 'large'
          : 'aligned')
      }
    }
    expect((await vecdb.collection.create(bulk, { dimension: 384 })).success).toBe(true)
    const vector = Array.from({ length: 384 }, (_, index) => index / 384)
    const batch = Array.from({ length: 180 }, (_, index) => ({
      id: `batch-${index}`,
      vector,
      metadata: { version: 1 },
    }))
    expect((await vecdb.vector.insert(bulk, batch)).success).toBe(true)
    expect((await vecdb.vector.upsert(bulk, batch.map(row => ({
      ...row,
      metadata: { version: 2 },
    })))).success).toBe(true)
    expect(await vecdb.collection.info(bulk)).toMatchObject({
      success: true,
      data: { count: batch.length },
    })
    expect(await vecdb.vector.search(bulk, vector, { topK: 1 })).toMatchObject({
      success: true,
      data: [
        {
          metadata: { version: 2 },
        },
      ],
    })
  }
  finally {
    if (vecdb.isInitialized) {
      for (const name of [...names, bulk]) await vecdb.collection.drop(name)
    }
    await vecdb.close()
    await lease.release()
  }
}, 120000)
