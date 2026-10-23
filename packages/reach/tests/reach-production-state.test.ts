/** Console日志不能在生产中被当作外部投递回执。 */
import { afterEach, expect, it, vi } from 'vitest'
import { reach } from '../src/index.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  await reach.close()
})

it.each(['NODE_ENV', 'HAI_CORE_ENV'])('生产标记%s拒绝console且不发布状态', async (key) => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HAI_CORE_ENV', 'test')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  vi.stubEnv(key, 'production')
  const result = await reach.init({ providers: [{ name: 'log', type: 'console' }] })
  expect(result.success).toBe(false)
  expect(reach.isInitialized).toBe(false)
})
