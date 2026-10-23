/** 生产配置不能把本机状态误当跨节点共享；显式测试模式可使用原后端。 */
import { afterEach, expect, it, vi } from 'vitest'
import { vecdb } from '../src/index.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  await vecdb.close()
})
it.each(['NODE_ENV', 'HAI_CORE_ENV'])('生产标记%s拒绝本机后端且不发布状态', async (key) => {
  await vecdb.close()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HAI_CORE_ENV', 'test')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  vi.stubEnv(key, 'production')
  const result = await vecdb.init({ type: 'lancedb', path: './data/should-not-be-created' })
  expect(result.success).toBe(false)
  expect(vecdb.isInitialized).toBe(false)
})
