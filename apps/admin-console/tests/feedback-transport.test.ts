import { apiContract } from '@h-ai/api-contract/feedback'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ routes: {} as Record<string, number> }))
vi.mock('@h-ai/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@h-ai/core')>()
  return {
    ...original,
    core: {
      ...original.core,
      config: {
        load: (_name: string, _file: string, schema: { parse: (value: unknown) => unknown }) => original.core.ok(schema.parse({
          transport: { maxPlaintextBytes: 256 * 1024, routePlaintextBytes: state.routes },
        })),
      },
    },
  }
})

beforeEach(() => {
  vi.resetModules()
  state.routes = {}
})

it('反馈附件使用固定路由预算，不增加普通业务容量', async () => {
  const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
  expect(getAdminKitConfig('/edge').transport).toMatchObject({
    maxPlaintextBytes: 256 * 1024,
    routePlaintextBytes: apiContract.feedbackTransportRoutes('/edge/api'),
  })
})

it('宿主能为特定反馈路径设置显式容量', async () => {
  state.routes = { '/api/feedback/reports': 8 * 1024 * 1024 }
  const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
  expect(getAdminKitConfig().transport).toMatchObject({
    routePlaintextBytes: {
      ...apiContract.feedbackTransportRoutes(),
      ...state.routes,
    },
  })
})

it('子目录应用的反馈容量匹配实际请求路径', async () => {
  const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
  const transport = getAdminKitConfig('/console').transport
  expect(transport).not.toBe(false)
  if (!transport)
    throw new Error('Transport disabled')
  expect(transport.routePlaintextBytes).toMatchObject(apiContract.feedbackTransportRoutes('/console/api'))
  expect(transport.routePlaintextBytes).not.toHaveProperty('/api/feedback/reports')
})
