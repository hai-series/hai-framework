import type { AuditProcedureDeps, ServContext } from '../src/index.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/index.js'

const id = '2ac4b928-f7fb-4df3-9ce4-76c0c2b72640'
const createdAt = new Date('2026-11-01T00:00:00Z')
const logger = core.logger.child({ module: 'serv-test', scope: 'feature-audit' })

function setup(options: {
  permissions?: string[]
  scope?: Awaited<ReturnType<AuditProcedureDeps['resolveReadScope']>>
} = {}) {
  const list = vi.fn<AuditProcedureDeps['audit']['list']>(async () => core.ok({
    items: [
      {
        id: 'audit-example',
        username: null,
        userId: null,
        resourceId: null,
        details: null,
        ipAddress: null,
        userAgent: null,
        category: 'business',
        outcome: 'success',
        severity: 'info',
        action: 'read',
        resource: 'orders',
        createdAt,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  }))
  const getStats = vi.fn<AuditProcedureDeps['audit']['getStats']>(async () => core.ok([
    { action: 'read', count: 1 },
  ]))
  const run = vi.fn<AuditProcedureDeps['audit']['backup']['run']>(async () => core.ok({
    id,
    key: `hai-private/audit-backups/${id}.jsonl`,
    recordCount: 1,
    sha256: 'a'.repeat(64),
    createdAt,
    cutoff: createdAt,
  }))
  const authorizeBackup: AuditProcedureDeps['authorizeBackup'] = ({ request }) => request.headers.get('x-hai-reauthentication') === 'verified-proof'
    ? core.ok(undefined)
    : core.err(HaiCommonError.FORBIDDEN, 'Reauthentication required')
  const contract = apiContract.create({ audit: apiContract.extensions.audit })
  const app = serv.createApp({
    contract,
    procedures: {
      audit: serv.createAuditProcedures({
        audit: {
          list,
          getStats,
          backup: { run },
        },
        resolveReadScope: () => options.scope === undefined
          ? { scopeId: 'team-a' }
          : options.scope,
        authorizeBackup,
      }),
    },
    createContext: ({ request }): ServContext => ({
      request,
      requestId: 'audit-test',
      locale: 'en-US',
      logger,
      session: { userId: 'auditor', roles: [], permissions: options.permissions ?? ['audit:read', 'audit:backup'] },
    }),
    http: { openapi: false, docs: false },
  })
  const client = apiClient.create(contract)
  return { app, client, list, getStats, run }
}

async function withClient<T>(fixture: ReturnType<typeof setup>, callback: (client: ReturnType<typeof setup>['client']) => Promise<T>) {
  const { client, app } = fixture
  const started = await client.init({
    baseUrl: 'https://audit.test/api/v1',
    fetch: serv.toFetch(app),
  })
  expect(started.success).toBe(true)
  try {
    return await callback(client)
  }
  finally {
    await client.close()
  }
}

describe('audit HTTP extensions', () => {
  it('reads tenant audit logs and stats via the typed client with server-owned scope', async () => {
    const fixture = setup()
    await withClient(fixture, async ({ audit }) => {
      const listed = await audit.logs.list({ startDate: '2026-11-01T00:00:00Z', page: 1 })
      expect(listed).toMatchObject({
        success: true,
        data: {
          items: [
            {
              id: 'audit-example',
              createdAt: createdAt.toISOString(),
            },
          ],
        },
      })
      expect(fixture.list).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'team-a', startDate: createdAt, page: 1 }))
      const stats = await audit.logs.stats({ resource: 'orders' })
      expect(stats).toEqual({
        success: true,
        data: [
          { action: 'read', count: 1 },
        ],
      })
      expect(fixture.getStats).toHaveBeenCalledWith(7, expect.objectContaining({ scopeId: 'team-a', resource: 'orders' }))
      const denied = await audit.logs.list({ scopeId: 'team-b' })
      expect(denied).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(await audit.logs.stats({ scopeId: 'team-b' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(fixture.list).toHaveBeenCalledTimes(1)
      expect(fixture.getStats).toHaveBeenCalledTimes(1)
    })
    const central = setup({
      scope: { global: true },
    })
    await withClient(central, async ({ audit }) => {
      expect(await audit.logs.stats({ days: 14, scopeId: 'team-b' })).toMatchObject({ success: true })
      expect(central.getStats).toHaveBeenCalledWith(14, expect.objectContaining({ scopeId: 'team-b' }))
    })
  })

  it('rejects unauthorized, malformed and reversed audit filters before querying the store', async () => {
    const unprivileged = setup({ permissions: [] })
    await withClient(unprivileged, async ({ audit }) => {
      const denied = await audit.logs.list({})
      expect(denied).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
    })
    expect(unprivileged.list).not.toHaveBeenCalled()

    const fixture = setup()
    const request = (query: string) => fixture.app.request(`/api/v1/audit/logs?${query}`)
    expect((await request('sortBy=unexpected')).status).toBe(400)
    expect((await request('startDate=2026-11-02T00%3A00%3A00Z&endDate=2026-11-01T00%3A00%3A00Z')).status).toBe(400)
    expect((await fixture.app.request('/api/v1/audit/logs/stats?days=366')).status).toBe(400)
    expect(fixture.list).not.toHaveBeenCalled()
    expect(fixture.getStats).not.toHaveBeenCalled()
  })

  it('requires both backup permission and reauthentication and serializes only the receipt', async () => {
    const proof = {
      context: { reauthentication: 'verified-proof' },
    }
    const unprivileged = setup({
      permissions: ['audit:read'],
    })
    await withClient(unprivileged, async ({ audit }) => {
      expect(await audit.backup.run({ id }, proof)).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
    })
    expect(unprivileged.run).not.toHaveBeenCalled()

    const fixture = setup({
      scope: null,
      permissions: ['audit:backup'],
    })
    await withClient(fixture, async ({ audit }) => {
      expect(await audit.backup.run({ id })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(fixture.run).not.toHaveBeenCalled()
      expect(await audit.backup.run({ id }, proof)).toEqual({
        success: true,
        data: {
          id,
          key: `hai-private/audit-backups/${id}.jsonl`,
          recordCount: 1,
          sha256: 'a'.repeat(64),
          createdAt: createdAt.toISOString(),
          cutoff: createdAt.toISOString(),
        },
      })
      expect(fixture.run).toHaveBeenCalledWith({
        id,
        signal: expect.any(AbortSignal),
      })
    })
  })
})
