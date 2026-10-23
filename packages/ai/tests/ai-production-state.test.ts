/** 自定义AI Store必须如实声明共享能力；生产拒绝本机临时Provider。 */
import type { VecdbConfigInput } from '@h-ai/vecdb'
import { reldb } from '@h-ai/reldb'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'
import { afterEach, expect, it, vi } from 'vitest'
import { ai } from '../src/index.js'
import { createDbStoreProvider } from '../src/store/providers/ai-store-provider-db.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await ai.close()
})
it('生产显式memory Provider也不能绕过共享状态要求', async () => {
  vi.stubEnv('HAI_CORE_ENV', 'production')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  const result = await ai.init({}, { storeProvider: createMemoryStoreProvider() })
  expect(result.success).toBe(false)
  expect(ai.isInitialized).toBe(false)
})

const vectors: Array<{ label: string, config?: VecdbConfigInput, scope: 'local' | 'shared' }> = [
  { label: 'uninitialized', scope: 'local' },
  { label: 'LanceDB', config: { type: 'lancedb', path: './test' }, scope: 'local' },
  { label: 'embedded Chroma', config: { type: 'chroma', path: './test' }, scope: 'local' },
  { label: 'Chroma URL', config: { type: 'chroma', url: 'http://vector.example:8000' }, scope: 'shared' },
  { label: 'Chroma host', config: { type: 'chroma', host: 'vector.example', port: 8000 }, scope: 'shared' },
  { label: 'Qdrant', config: { type: 'qdrant', url: 'http://vector.example:6333' }, scope: 'shared' },
  { label: 'pgvector', config: { type: 'pgvector', host: 'vector.example', database: 'vectors', user: 'test' }, scope: 'shared' },
]

it.each(vectors)('dB Provider按实际关系/向量能力判断$label，工厂名称不代替共享能力', ({ config, scope }) => {
  const vectorConfig = config ? VecdbConfigSchema.parse(config) : null
  vi.spyOn(vecdb, 'config', 'get').mockReturnValue(vectorConfig)
  const remoteDatabase = createDbStoreProvider({ sql: reldb.sql, jsonOps: reldb.json, dbType: 'postgresql', vecdb })
  expect(remoteDatabase.stateScope).toBe(scope)
  const localDatabase = createDbStoreProvider({ sql: reldb.sql, jsonOps: reldb.json, dbType: 'sqlite', vecdb })
  expect(localDatabase.stateScope).toBe('local')
})
