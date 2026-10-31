import type { ProvisionResult } from '../src/index.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { deploy, loadDeploymentConfig, loadDeploymentEnvironment } from '../src/index.js'

let root: string | undefined
afterEach(async () => {
  await deploy.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (root)
    rmSync(root, { recursive: true, force: true })
})

it('云开通保留同后端业务配置，以新连接替换旧认证并完整持久化', async () => {
  root = mkdtempSync(join(tmpdir(), 'hai-cloud-retained-'))
  mkdirSync(join(root, 'config'))
  mkdirSync(join(root, '.vercel/output'), { recursive: true })
  writeFileSync(join(root, '.vercel/output/config.json'), '{"version":3}')
  writeFileSync(join(root, 'package.json'), '{"name":"retained"}')
  const names = ['reldb', 'cache', 'storage', 'reach'].map(name => `@h-ai/${name}`)
  writeFileSync(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: Object.fromEntries(names.map(name => [name, { version: '1' }])) } }, packages: Object.fromEntries(names.map(name => [`${name}@1`, {}])), snapshots: Object.fromEntries(names.map(name => [`${name}@1`, {}])) }))
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'config/_db.yml'), stringify({ type: 'postgresql', database: 'old', host: 'old-db', password: 'old-password', pool: { max: 7 }, operationLog: { write: true } }))
  writeFileSync(join(root, 'config/_cache.yml'), stringify({ type: 'redis', url: 'redis://old-cache', sentinel: { masterName: 'old' }, keyPrefix: 'business:', maxRetries: 8, retryDelay: 90 }))
  writeFileSync(join(root, 'config/_storage.yml'), stringify({ type: 's3', bucket: 'old', region: 'old', prefix: 'tenant', publicEndpoint: 'https://files.example.test/portal/files', publicUrl: 'https://cdn.example.test', operationLog: { read: true } }))
  writeFileSync(join(root, 'config/_reach.yml'), stringify({ providers: [{ name: 'alerts', type: 'smtp', host: 'old-email', from: 'old@example.test', pass: 'old-password' }, { name: 'sms', type: 'aliyun-sms', signName: 'old', endpoint: 'custom-sms.example.test' }, { name: 'webhook', type: 'api', url: 'https://hooks.example.test', idempotent: true, redirect: 'error', requireHttps: true }] }))
  let deployed: Record<string, string> = {}
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input)
    if (url.includes('/env?')) {
      const entries: Array<{ key: string, value: string }> = JSON.parse(String(options?.body))
      deployed = Object.fromEntries(entries.map(entry => [entry.key, entry.value]))
    }
    if (url.includes('/v2/user'))
      return Response.json({ user: { username: 'fixture' } })
    if (url.includes('/v10/projects/'))
      return Response.json({ id: 'platform' })
    if (url.includes('/v13/deployments?'))
      return Response.json({ id: 'deployment', url: 'retained.example.test' })
    if (url.includes('/v13/deployments/'))
      return Response.json({ readyState: 'READY' })
    return Response.json({})
  }))
  const outputs: ProvisionResult[] = ([
    { serviceType: 'db', provisionerName: 'neon', envVars: { HAI_DB: JSON.stringify({ type: 'postgresql', url: 'postgresql://new-user:new-password@new-db/hai', database: 'hai' }) } },
    { serviceType: 'cache', provisionerName: 'upstash', envVars: { HAI_CACHE: JSON.stringify({ type: 'redis', url: 'rediss://default:new-password@new-cache:6379' }) } },
    { serviceType: 'storage', provisionerName: 'r2', envVars: { HAI_STORAGE: JSON.stringify({ type: 's3', endpoint: 'https://new-r2.example.test', bucket: 'new-bucket', region: 'auto', accessKeyId: 'new-key', secretAccessKey: 'new-secret' }) } },
    { serviceType: 'email', provisionerName: 'resend', envVars: { HAI_REACH_PROVIDERS: JSON.stringify([{ type: 'smtp', name: 'email', host: 'new-email', port: 465, secure: true, user: 'new-user', pass: 'new-password', from: 'new@example.test' }]) } },
    { serviceType: 'sms', provisionerName: 'aliyun', envVars: { HAI_REACH_PROVIDERS: JSON.stringify([{ type: 'aliyun-sms', name: 'sms', accessKeyId: 'new-key', accessKeySecret: 'new-secret', signName: 'new-sign' }]) } },
  ] satisfies Array<Omit<ProvisionResult, 'resourceStatus' | 'resourceInfo'>>).map((output): ProvisionResult => ({ ...output, resourceStatus: 'reused', resourceInfo: 'fixture' }))
  vi.spyOn(deploy, 'provisionAll').mockResolvedValue({ success: true, data: outputs })
  expect(await deploy.init({ environment: 'test', provider: { type: 'vercel', token: 'fixture-token' } })).toMatchObject({ success: true })
  const result = await deploy.deployApp(root, { serviceModes: { db: 'default', cache: 'default', storage: 'default', email: 'default', sms: 'default', HAI_REACH_PROVIDERS_2: 'keep' } })
  expect(result.success).toBe(true)
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    return
  for (const values of [loaded.data.values, deployed]) {
    const resolved = (name: string) => {
      const result = loadDeploymentConfig(name, join(root!, 'config', `_${name}.yml`), values)
      expect(result.success).toBe(true)
      if (!result.success)
        throw new Error(result.error.message)
      return result.data
    }
    expect(resolved('db')).toMatchObject({ pool: { max: 7 }, operationLog: { write: true }, database: 'hai', url: expect.stringContaining('@new-db') })
    expect(resolved('db')).not.toHaveProperty('password')
    expect(resolved('cache')).toMatchObject({ keyPrefix: 'business:', maxRetries: 8, retryDelay: 90, url: expect.stringContaining('@new-cache') })
    expect(resolved('cache')).not.toHaveProperty('sentinel')
    expect(resolved('storage')).toMatchObject({ prefix: 'tenant', publicEndpoint: 'https://files.example.test/portal/files', publicUrl: 'https://cdn.example.test', operationLog: { read: true }, bucket: 'new-bucket', endpoint: 'https://new-r2.example.test' })
    expect(resolved('reach').providers).toEqual([
      expect.objectContaining({ name: 'alerts', host: 'new-email', from: 'new@example.test', pass: 'new-password' }),
      expect.objectContaining({ name: 'sms', endpoint: 'custom-sms.example.test', signName: 'new-sign' }),
      expect.objectContaining({ name: 'webhook', idempotent: true, redirect: 'error', requireHttps: true }),
    ])
  }
})
