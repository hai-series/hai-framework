import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { deploy } from '@h-ai/deploy'
import { ReachConfigSchema } from '@h-ai/reach'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { StorageConfigSchema } from '@h-ai/storage'
import { afterEach, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'

const temporary: string[] = []
afterEach(async () => {
  await deploy.close()
  core.config.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it('loads provisioned connections through Core in a real generated application', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hai-cloud-config-'))
  temporary.push(root)
  await createProject({
    name: 'cloud-app',
    cwd: root,
    appType: 'admin',
    defaults: true,
    install: false,
    git: false,
    packageManager: 'pnpm',
    verbose: false,
  })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input))
    if (url.hostname === 'api.vercel.com')
      return Response.json({ user: { username: 'test' } })
    if (url.hostname === 'console.neon.tech') {
      return Response.json(options?.method === 'POST'
        ? { project: { id: 'project-1' }, connection_uris: [{ connection_uri: 'postgresql://user:pass@db.example.test/neondb?sslmode=require' }] }
        : { projects: [] })
    }
    if (url.hostname === 'api.upstash.com') {
      return Response.json(options?.method === 'POST'
        ? { database_id: 'cache-1', endpoint: 'cache.example.test', port: 6379, password: 'p@ss:word' }
        : [])
    }
    return Response.json({ result: [], data: [] })
  }))
  expect(await deploy.init({
    provider: { type: 'vercel', token: 'test-token' },
    services: {
      db: { provisioner: 'neon', apiKey: 'test-neon' },
      cache: { provisioner: 'upstash', email: 'owner@example.test', apiKey: 'test-upstash' },
      storage: { provisioner: 'cloudflare-r2', accountId: 'account', apiToken: 'test-cf', accessKeyId: 'test-s3', secretAccessKey: 'test-secret' },
      email: { provisioner: 'resend', apiKey: 'test-resend', from: 'sender@example.test' },
      sms: { provisioner: 'aliyun', accessKeyId: 'test-sms', accessKeySecret: 'test-sms-secret', signName: 'Test' },
    },
  })).toMatchObject({ success: true })
  const provisioned = await deploy.provisionAll('cloud-app')
  expect(provisioned.success).toBe(true)
  if (!provisioned.success)
    return
  const providers: unknown[] = []
  for (const service of provisioned.data) {
    for (const [key, value] of Object.entries(service.envVars)) {
      if (key === 'HAI_REACH_PROVIDERS')
        providers.push(...JSON.parse(value) as unknown[])
      else
        vi.stubEnv(key, value)
    }
  }
  vi.stubEnv('HAI_REACH_PROVIDERS', JSON.stringify(providers))
  const config = join(root, 'cloud-app', 'config')
  expect(core.config.load('db', join(config, '_db.yml'), ReldbConfigSchema)).toMatchObject({
    success: true,
    data: { type: 'postgresql', database: 'neondb', url: 'postgresql://user:pass@db.example.test/neondb?sslmode=require' },
  })
  expect(core.config.load('cache', join(config, '_cache.yml'), CacheConfigSchema)).toMatchObject({
    success: true,
    data: { type: 'redis', url: 'rediss://default:p%40ss%3Aword@cache.example.test:6379' },
  })
  const storage = core.config.load('storage', join(config, '_storage.yml'), StorageConfigSchema)
  expect(storage.success, JSON.stringify(storage)).toBe(true)
  expect(storage).toMatchObject({
    success: true,
    data: { type: 's3', region: 'auto', bucket: 'cloud-app-storage', accessKeyId: 'test-s3', secretAccessKey: 'test-secret' },
  })
  const reach = core.config.load('reach', join(config, '_reach.yml'), ReachConfigSchema)
  expect(reach.success).toBe(true)
  if (reach.success) {
    expect(reach.data.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'email', type: 'smtp', host: 'smtp.resend.com', port: 465, secure: true, from: 'sender@example.test' }),
      expect.objectContaining({ name: 'sms', type: 'aliyun-sms', signName: 'Test' }),
    ]))
  }
}, 30_000)
