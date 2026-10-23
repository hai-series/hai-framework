/** 验证共享变量文档没有把 Chroma 独有的校验范围强加给 Qdrant。 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { VecdbConfigSchema } from '@h-ai/vecdb'
import { describe, expect, it } from 'vitest'

describe('chroma environment catalog scope', () => {
  it('共享 URL/APIKEY 说明与真实 provider 校验范围一致', async () => {
    const catalog = JSON.parse(await readFile(fileURLToPath(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url)), 'utf8'))
    const token = catalog.find(entry => entry.name === 'HAI_VECDB_APIKEY')
    const url = catalog.find(entry => entry.name === 'HAI_VECDB_URL')
    expect(VecdbConfigSchema.safeParse({ type: 'qdrant', apiKey: 'provider-token with-space' }).success).toBe(true)
    expect(VecdbConfigSchema.safeParse({ type: 'chroma', apiKey: 'provider-token with-space' }).success).toBe(false)
    expect(token.constraint).toContain('Qdrant')
    expect(token.constraint).toContain('Chroma')
    expect(token.constraint).not.toContain('正则')
    for (const provider of ['pgvector', 'Qdrant', 'Chroma'])
      expect(url.description).toContain(provider)
  })
})
