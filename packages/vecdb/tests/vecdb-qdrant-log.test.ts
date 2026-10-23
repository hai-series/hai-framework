/** 验证 Provider 交给 logger 的上下文已复用 core URL 脱敏；不将旧局部 helper 差异宣称为实际日志泄漏。 */

import { core } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { VecdbConfigSchema } from '../src/vecdb-config.js'

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    async getCollections() { return { collections: [] } }
  },
}))

it('发送到 logger 的 URL 上下文已屏蔽用户信息、query 与 fragment 中的敏感值', async () => {
  const info = vi.fn<(message: string, context?: Record<string, unknown>) => void>()
  const logger = { info, error: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), fatal: vi.fn(), child: () => logger }
  const child = vi.spyOn(core.logger, 'child').mockReturnValue(logger)
  const { createQdrantProvider } = await import('../src/providers/vecdb-provider-qdrant.js')
  const provider = createQdrantProvider()
  try {
    expect((await provider.connect(VecdbConfigSchema.parse({
      type: 'qdrant',
      url: 'https://fixture-user:fixture-password@qdrant.example.test:6333/?token=fixture-query&trace=visible#access_token=fixture-fragment',
    }))).success).toBe(true)
    const context = info.mock.calls.find(([message]) => message === 'Qdrant connected')?.[1]
    expect(context).toBeDefined()
    const text = JSON.stringify(context)
    for (const secret of ['fixture-user', 'fixture-password', 'fixture-query', 'fixture-fragment'])
      expect(text).not.toContain(secret)
    expect(text).toContain('trace=visible')
    expect(text).toContain('[REDACTED]')
  }
  finally {
    await provider.close()
    child.mockRestore()
  }
})
