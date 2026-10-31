import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { deploy, loadDeploymentEnvironment } from '../src/index.js'

let root: string | undefined
afterEach(async () => {
  await deploy.close()
  vi.unstubAllGlobals()
  if (root)
    rmSync(root, { recursive: true, force: true })
})

it('creates the selected cloud database, skips a kept cache and persists actual environment values', async () => {
  root = mkdtempSync(join(tmpdir(), 'hai-cloud-selected-'))
  mkdirSync(join(root, 'config'))
  mkdirSync(join(root, '.vercel/output'), { recursive: true })
  writeFileSync(join(root, '.vercel/output/config.json'), '{"version":3}')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'selected', dependencies: { '@h-ai/reldb': '1', '@h-ai/cache': '1' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' }, '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {}, '@h-ai/cache@1': {} }, snapshots: { '@h-ai/reldb@1': {}, '@h-ai/cache@1': {} } }))
  writeFileSync(join(root, '.env.test'), 'HAI_CACHE=\'{"type":"redis","url":"redis://existing:6379"}\'\n')
  writeFileSync(join(root, 'config/_db.yml'), 'type: postgresql\ndatabase: app\n')
  writeFileSync(join(root, '.vercel/output/index.html'), 'test build output')
  const requests: Array<{ url: string, method?: string, body?: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input)
    requests.push({ url, method: options?.method, body: typeof options?.body === 'string' ? options.body : undefined })
    if (url.includes('console.neon.tech')) {
      return Response.json(options?.method === 'POST'
        ? { project: { id: 'neon-created' }, connection_uris: [{ connection_uri: 'postgresql://operator:test-secret@db.example.test/app' }] }
        : { projects: [] })
    }
    if (url.includes('/v2/user'))
      return Response.json({ user: { username: 'test' } })
    if (url.includes('/v10/projects/') && !url.includes('/env'))
      return Response.json({ id: 'platform' })
    if (url.includes('/v13/deployments/'))
      return Response.json({ readyState: 'READY' })
    if (url.includes('/v13/deployments?prebuilt=1'))
      return Response.json({ id: 'deployment', url: 'selected.example.test' })
    return Response.json({})
  }))
  expect(await deploy.init({ environment: 'test', provider: { type: 'vercel', token: 'test-platform-token' }, services: { db: { provisioner: 'neon', apiKey: 'test-neon-key' } } })).toMatchObject({ success: true })
  const result = await deploy.deployApp(root, { serviceModes: { db: 'default', cache: 'keep' } })
  expect(result.success).toBe(true)
  expect(requests.some(request => request.url.includes('console.neon.tech') && request.method === 'POST')).toBe(true)
  expect(requests.some(request => request.url.includes('upstash'))).toBe(false)
  expect(requests.some(request => request.url.includes('/v10/projects/selected-test'))).toBe(true)
  const settings = requests.find(request => request.url.includes('/env?'))
  expect(JSON.parse(settings?.body ?? '[]')).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'HAI_DEPLOY_ENVIRONMENT', value: 'test' }),
    expect.objectContaining({ key: 'HAI_CORE_ENV', value: 'test' }),
    expect.objectContaining({ key: 'HAI_CACHE_TYPE', value: 'redis' }),
    expect.objectContaining({ key: 'HAI_CACHE_URL', value: 'redis://existing:6379' }),
  ]))
  expect(settings?.body).not.toContain('test-platform-token')
  expect(readFileSync(join(root, '.env.test'), 'utf8')).not.toContain('test-secret')
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(loaded.success).toBe(true)
  if (loaded.success)
    expect(loaded.data.values).toMatchObject({ HAI_DB_TYPE: 'postgresql', HAI_DB_DATABASE: 'app', HAI_DB_URL: 'postgresql://operator:test-secret@db.example.test/app' })
})
