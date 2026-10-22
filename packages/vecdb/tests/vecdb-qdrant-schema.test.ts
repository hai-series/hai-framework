/** 真实 SDK 的向量字段联合类型必须按实际能力处理，不能用仿造类型猜成默认集合。 */

import type { QdrantContainerLease } from './helpers/qdrant-container.js'
import { QdrantClient } from '@qdrant/js-client-rest'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createQdrantProvider } from '../src/providers/vecdb-provider-qdrant.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'
import { HaiVecdbError } from '../src/vecdb-types.js'
import { acquireQdrantContainer } from './helpers/qdrant-container.js'

let lease: QdrantContainerLease | undefined
beforeAll(async () => {
  lease = await acquireQdrantContainer()
}, 120_000)
afterAll(async () => {
  await lease?.release()
}, 30_000)

it.each(['named', 'manhattan'] as const)('不将外部 %s 集合当作未命名 cosine 集合', async (kind) => {
  const url = lease!.url
  const native = new QdrantClient({ url })
  const provider = createQdrantProvider()
  const name = `external-${kind}`
  try {
    expect((await provider.connect(VecdbConfigSchema.parse({ type: 'qdrant', url }))).success).toBe(true)
    await native.createCollection(name, { vectors: kind === 'named' ? { document: { size: 3, distance: 'Cosine' } } : { size: 3, distance: 'Manhattan' } })
    const info = await provider.collection.info(name)
    expect(info.success).toBe(false)
    if (!info.success)
      expect(info.error.code).toBe(HaiVecdbError.CONFIG_ERROR.code)
    const write = await provider.vector.upsert(name, [{ id: 'unused', vector: [1, 0, 0] }])
    expect(write.success).toBe(false)
    if (!write.success)
      expect(write.error.code).toBe(HaiVecdbError.CONFIG_ERROR.code)
    expect((await native.count(name, { exact: true })).count).toBe(0)
    expect((await provider.collection.drop(name)).success).toBe(true)
  }
  finally {
    await provider.close()
    if (await native.collectionExists(name).then(result => result.exists))
      await native.deleteCollection(name)
  }
}, 15_000)
