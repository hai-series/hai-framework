import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy, getDeployRecovery } from '../src/index.js'

const fetchMock = vi.fn()
let directory: string
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  directory = mkdtempSync(join(tmpdir(), 'hai-recovery-'))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'same-project' }))
  writeFileSync(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\npackages: {}\nsnapshots: {}\n')
})
afterEach(async () => {
  await deploy.close()
  vi.unstubAllGlobals()
  rmSync(directory, { recursive: true, force: true })
})

async function initialize(withCache = false) {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { username: 'test' } }))
  fetchMock.mockResolvedValueOnce(Response.json({ projects: [] }))
  if (withCache)
    fetchMock.mockResolvedValueOnce(Response.json([]))
  expect(await deploy.init({
    provider: { type: 'vercel', token: 'private-platform-token' },
    services: {
      db: { provisioner: 'neon', apiKey: 'private-neon-key' },
      ...(withCache ? { cache: { provisioner: 'upstash' as const, email: 'test@example.test', apiKey: 'private-cache-key' } } : {}),
    },
  })).toMatchObject({ success: true })
}

function newDatabase() {
  fetchMock.mockResolvedValueOnce(Response.json({ projects: [] }))
  fetchMock.mockResolvedValueOnce(Response.json({
    project: { id: 'database-created' },
    connection_uris: [{ connection_uri: 'postgresql://u:private-password@host/db' }],
  }))
}

describe('deployment recovery', () => {
  it('preserves created database and uncertain cache state without secrets', async () => {
    await initialize(true)
    newDatabase()
    fetchMock.mockRejectedValueOnce(new Error('private-cache-key network failure'))
    const result = await deploy.provisionAll('same-project')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(getDeployRecovery(result.error)).toMatchObject({
      projectName: 'same-project',
      stage: 'provision:cache',
      resources: [
        { serviceType: 'db', resourceStatus: 'created', resourceInfo: 'neon-project:database-created' },
        { serviceType: 'cache', resourceStatus: 'unknown' },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(JSON.stringify(result)).not.toContain('envVars')
    expect(result.error.suggestion).toBeTruthy()
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true)
  })

  it('preserves a known created resource when connection extraction fails', async () => {
    await initialize()
    fetchMock.mockResolvedValueOnce(Response.json({ projects: [] }))
    fetchMock.mockResolvedValueOnce(Response.json({ project: { id: 'created-without-uri' } }))
    const result = await deploy.provisionAll('same-project')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(getDeployRecovery(result.error)?.resources).toEqual([{ serviceType: 'db', provisionerName: 'neon', resourceInfo: 'neon-project:created-without-uri', resourceStatus: 'created' }])
  })

  it('returns resource and platform project information after uploading prebuilt output fails', async () => {
    await initialize()
    mkdirSync(join(directory, '.vercel/output'), { recursive: true })
    writeFileSync(join(directory, '.vercel/output/config.json'), '{"version":3}')
    writeFileSync(join(directory, '.vercel/output/index.html'), 'prebuilt')
    newDatabase()
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'platform-existing' }))
    fetchMock.mockResolvedValueOnce(Response.json({}))
    fetchMock.mockRejectedValueOnce(new Error('upload failure'))
    const result = await deploy.deployApp(directory)
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(getDeployRecovery(result.error)).toMatchObject({
      stage: 'deploy',
      platformProjectId: 'platform-existing',
      resources: [{ resourceStatus: 'created', resourceInfo: 'neon-project:database-created' }],
    })
    expect(JSON.stringify(result)).not.toContain('private-')
  })

  it('marks same-name database reuse on retry and does not create or delete it', async () => {
    await initialize()
    fetchMock.mockResolvedValueOnce(Response.json({ projects: [{ id: 'existing-db', name: 'same-project-db' }] }))
    fetchMock.mockResolvedValueOnce(Response.json({ uri: 'postgresql://u:p@host/db' }))
    const result = await deploy.provisionAll('same-project')
    expect(result).toMatchObject({ success: true, data: [{ resourceStatus: 'reused', resourceInfo: 'neon-project:existing-db' }] })
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })
})
