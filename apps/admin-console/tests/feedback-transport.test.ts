import { resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ settings: { appId: 'budget-recovery', notificationMode: 'disabled', maxTotalBytes: 4 * 1024 * 1024 } as Record<string, unknown>, routes: {} as Record<string, number> }))
vi.mock('@h-ai/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@h-ai/core')>()
  return { ...original, core: { ...original.core, config: {
    ...original.core.config,
    get: (name: string) => name === 'feedback' ? state.settings : undefined,
    load: (_name: string, _filename: string, schema: { parse: (value: unknown) => unknown }) => original.ok(schema.parse({ transport: { maxPlaintextBytes: 256 * 1024, routePlaintextBytes: state.routes } })),
  } } }
})

beforeEach(() => {
  vi.resetModules()
  state.settings = { appId: 'budget-recovery', notificationMode: 'disabled', maxTotalBytes: 4 * 1024 * 1024 }
  state.routes = {}
})

it.each([4, 40])('反馈未就绪时仍按配置保留 %s MiB 路由预算', async (mib) => {
  state.settings.maxTotalBytes = mib * 1024 * 1024
  const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
  const result = getAdminKitConfig()
  expect(result.transport).not.toBe(false)
  if (!result.transport)
    throw new Error('Transport disabled')
  expect(result.transport.routePlaintextBytes['/api/feedback/reports']).toBe(resolveFeedbackBudget({ maxTotalBytes: mib * 1024 * 1024 }).maxTransportBytes)
  expect(result.transport.maxPlaintextBytes).toBe(256 * 1024)
})

it('无效的可选反馈配置不阻止业务配置，宿主显式容量仍优先', async () => {
  state.settings.maxTotalBytes = -1
  state.routes = { '/api/feedback/reports': 8 * 1024 * 1024 }
  const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
  const result = getAdminKitConfig()
  expect(result.transport).not.toBe(false)
  if (!result.transport)
    throw new Error('Transport disabled')
  expect(result.transport.routePlaintextBytes['/api/feedback/reports']).toBe(8 * 1024 * 1024)
})
