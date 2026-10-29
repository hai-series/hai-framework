import type { DeployAppOptions } from '../src/deploy-types.js'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ok } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import * as ssh from '../src/container/deploy-ssh.js'
import { createDeploymentPlan } from '../src/index.js'

let root: string | undefined

it.each(['vite', 'sveltekit'])('平台浏览器计划从根 build.images 读取 web 角色，不要求 OCI 制品：%s', async (kind) => {
  root = await mkdtemp(join(tmpdir(), 'hai-deploy-plan-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@example/browser', version: '1.0.0' }))
  await writeFile(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'web', dockerfile: 'images/web.Dockerfile' }] } }))
  await writeFile(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': kind === 'sveltekit' ? { devDependencies: { '@sveltejs/kit': { version: '2' } } } : {} }, packages: {}, snapshots: {} }))
  await writeFile(join(root, '.env.prod'), 'HAI_CORE_ENV=production\n')
  expect(await createDeploymentPlan(root, { provider: { type: 'vercel', token: 'plan-test-token' } }, { environment: 'prod' })).toMatchObject({ success: true, data: { projectName: 'browser-prod', selected: ['web'], containers: [] } })
  const legacyOptions = { environment: 'prod', projectName: 'legacy-override' }
  expect(await createDeploymentPlan(root, { provider: { type: 'vercel', token: 'plan-test-token' } }, legacyOptions)).toMatchObject({ success: false, error: { message: expect.stringContaining('projectName') } })
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (root)
    await rm(root, { recursive: true, force: true })
  root = undefined
})

it('只读计划使用工程身份、校验制品、报告保留服务与未知远端基线，且不生成凭据', async () => {
  root = await mkdtemp(join(tmpdir(), 'hai-deploy-plan-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@business/shop', version: '1.0.0', dependencies: {} }))
  await writeFile(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv' }, { name: 'web' }] } }))
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nimporters:\n  .: {}\n')
  await writeFile(join(root, '.env.prod'), 'PRIVATE_TOKEN=DEPLOY_PLAN_SENTINEL\n')
  const directory = join(root, '.hai/build/docker/build-1')
  await mkdir(directory, { recursive: true })
  const image = new TextEncoder().encode('test-archive-bytes')
  await writeFile(join(directory, 'serv-1.0.0.tar'), image)
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.0.0', buildId: 'build-1', hasWeb: true, partial: true, images: [{ name: 'serv', file: 'serv-1.0.0.tar', imageRef: 'shop-app:build-1', sha256: createHash('sha256').update(image).digest('hex') }] }))
  await writeFile(join(root, '.hai/build/docker/latest'), 'build-1')
  const before = await readdir(root, { recursive: true })
  const envBefore = await readFile(join(root, '.env.prod'), 'utf8')
  const result = await createDeploymentPlan(root, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 }, ssh: { host: 'host.example.test', username: 'deploy', password: 'SSH_PLAN_SENTINEL' } } }, { environment: 'prod', envDir: root })
  expect(result).toMatchObject({ success: true, data: { projectName: 'shop-prod', selected: ['serv'], retained: ['web'], artifact: { buildId: 'build-1', verified: true }, baseline: { required: true, state: 'not-inspected' }, recovery: { databaseRollback: false, preservesVolumes: true } } })
  expect(JSON.stringify(result)).not.toMatch(/DEPLOY_PLAN_SENTINEL|SSH_PLAN_SENTINEL/)
  expect(await readdir(root, { recursive: true })).toEqual(before)
  expect(await readFile(join(root, '.env.prod'), 'utf8')).toBe(envBefore)
  const execute = vi.fn(async (_command: string) => ok({ stdout: 'release-verified-1', stderr: '', stdoutTruncated: false, stderrTruncated: false }))
  vi.spyOn(ssh, 'createSshExecutor').mockReturnValue({ exec: execute, ping: async () => ok(undefined), upload: async () => ok(undefined) })
  const inspected = await createDeploymentPlan(root, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 }, ssh: { host: 'host.example.test', username: 'deploy' } } }, { environment: 'prod', envDir: root, inspectRemote: true })
  expect(inspected).toMatchObject({ success: true, data: { baseline: { state: 'verified', release: 'release-verified-1' }, recovery: { point: 'release-verified-1' } } })
  expect(execute.mock.calls[0]?.[0]).not.toMatch(/mkdir|chmod|touch|rm |compose up/)
  expect(await readdir(root, { recursive: true })).toEqual(before)
})

/** 从真实配置和锁文件走扫描，避免用测试替身重复实现部署规则。 */
async function middlewareFixture(configs: Record<string, unknown>, partial = false) {
  root = await mkdtemp(join(tmpdir(), 'hai-deploy-plan-'))
  const modules: Record<string, string> = { db: 'reldb', iam: 'iam', reach: 'reach', storage: 'storage', vecdb: 'vecdb' }
  const dependencies = Object.fromEntries(Object.keys(configs).map(name => [`@h-ai/${modules[name]}`, { version: '1' }]))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'shop', version: '1.0.0' }))
  await writeFile(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies } }, packages: Object.fromEntries(Object.keys(dependencies).map(name => [`${name}@1`, {}])) }))
  await writeFile(join(root, '.env.prod'), 'PRIVATE_TOKEN=DEPLOY_PLAN_SENTINEL\n')
  await mkdir(join(root, 'config'))
  for (const [name, config] of Object.entries(configs))
    await writeFile(join(root, 'config', `_${name}.yml`), stringify(config))
  const artifactDir = join(root, '.hai/build/docker')
  await mkdir(artifactDir, { recursive: true })
  const image = 'plan-fixture-archive'
  await writeFile(join(artifactDir, 'serv-1.0.0.tar'), image)
  await writeFile(join(artifactDir, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.0.0', buildId: 'plan-fixture', hasWeb: false, partial, images: [{ name: 'serv', file: 'serv-1.0.0.tar', imageRef: 'shop:plan-fixture', sha256: createHash('sha256').update(image).digest('hex') }] }))
  return root
}

it('实际 LDAP 和 SMTP 沿用 Compose 服务命名，逻辑卷不冒充引擎卷名', async () => {
  const directory = await middlewareFixture({ iam: { login: { ldap: true }, ldap: { url: 'ldap://directory.example.test' } }, reach: { providers: [{ name: 'email', type: 'smtp', host: 'smtp.example.test' }] } })
  await mkdir(join(directory, '.hai/deploy/runtime'), { recursive: true })
  await writeFile(join(directory, '.hai/deploy/runtime/shop-prod.secrets.json'), 'INVALID_PLAN_CREDENTIAL_CACHE')
  const before = await readdir(directory, { recursive: true })
  const result = await createDeploymentPlan(directory, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } }, { environment: 'prod' })
  expect(result).toMatchObject({ success: true, data: { containers: ['hai-shop-prod-serv'], composeManagedServices: ['ldap', 'email'], logicalVolumes: ['shop-prod-ldap-data', 'shop-prod-ldap-config'], configuration: { files: [join(directory, '.env.prod'), join(directory, 'config/_iam.yml'), join(directory, 'config/_reach.yml')] } } })
  expect(await readdir(directory, { recursive: true })).toEqual(before)
})

it.each<{ name: string, host: string, options: DeployAppOptions, hosted: boolean, action: string }>([
  { name: 'keep 内部容器连接', host: 'db', options: { serviceModes: { db: 'keep' } }, hosted: true, action: 'default' },
  { name: 'keep 外部连接', host: 'existing.example.test', options: { serviceModes: { db: 'keep' } }, hosted: false, action: 'keep' },
  { name: '跳过外部中间件', host: 'existing.example.test', options: { skipMiddleware: true }, hosted: false, action: 'keep' },
  { name: '仅选择 app', host: 'db', options: { selectedServices: ['serv'] }, hosted: false, action: 'keep' },
])('计划遵守执行端的 $name 规则且不读写凭据', async ({ host, options, hosted, action }) => {
  const directory = await middlewareFixture({ db: { type: 'postgresql', url: `postgresql://hai:PLAN_DB_SECRET@${host}:5432/hai`, database: 'hai' } })
  const before = await readdir(directory, { recursive: true })
  const result = await createDeploymentPlan(directory, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } }, { ...options, environment: 'prod' })
  expect(result).toMatchObject({ success: true, data: { containers: ['hai-shop-prod-serv', ...(hosted ? ['hai-shop-prod-db'] : [])], logicalVolumes: hosted || host === 'db' ? ['shop-prod-db-data'] : [], middleware: [{ service: 'db', action }] } })
  if (options.selectedServices)
    expect(result).toMatchObject({ success: true, data: { retained: ['db'] } })
  expect(JSON.stringify(result)).not.toContain('PLAN_DB_SECRET')
  expect(await readdir(directory, { recursive: true })).toEqual(before)
})

it('云开通配置不伪报本地数据库容器，也不发网络请求', async () => {
  const directory = await middlewareFixture({ db: { type: 'postgresql' } })
  const network = vi.spyOn(globalThis, 'fetch')
  const result = await createDeploymentPlan(directory, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } }, services: { db: { provisioner: 'neon', apiKey: 'PLAN_CLOUD_SECRET' } } }, { environment: 'prod' })
  expect(result).toMatchObject({ success: true, data: { containers: ['hai-shop-prod-serv'], logicalVolumes: [], middleware: [{ service: 'db', action: 'default', provisioner: 'neon' }] } })
  expect(network).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toContain('PLAN_CLOUD_SECRET')
})

it('文件后端共享实际 app 数据卷，应用增量仍挂载同一数据卷并保留未选服务', async () => {
  const directory = await middlewareFixture({ db: { type: 'sqlite' }, storage: { type: 'local' }, vecdb: { type: 'lancedb' } })
  const config = { provider: { type: 'docker-ssh' as const, expose: { hostPort: 8080 } } }
  expect(await createDeploymentPlan(directory, config, { environment: 'prod' })).toMatchObject({ success: true, data: { containers: ['hai-shop-prod-serv'], logicalVolumes: ['shop-prod-data'] } })
  const manifest = join(directory, '.hai/build/docker/manifest.json')
  await writeFile(manifest, JSON.stringify({ ...JSON.parse(await readFile(manifest, 'utf8')), partial: true }))
  expect(await createDeploymentPlan(directory, config, { environment: 'prod' })).toMatchObject({ success: true, data: { selected: ['serv'], logicalVolumes: ['shop-prod-data'], retained: ['db', 'storage', 'vecdb'], baseline: { required: true } } })
})

it.each([false, true])('自建 Storage 只读计划与实际 gateway 拓扑一致，应用增量=%s', async (partial) => {
  const directory = await middlewareFixture({ storage: { type: 's3', bucket: 'business-files', endpoint: 'http://storage:9000', publicEndpoint: 'https://files.example.com' } }, partial)
  const before = await readdir(directory, { recursive: true })
  const result = await createDeploymentPlan(directory, { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } }, { environment: 'prod' })
  expect(result).toMatchObject({ success: true, data: { selected: partial ? ['serv'] : ['serv', 'storage', 'gateway'], retained: partial ? ['storage', 'gateway'] : [], containers: partial ? ['hai-shop-prod-serv'] : ['hai-shop-prod-serv', 'hai-shop-prod-gateway', 'hai-shop-prod-storage'], logicalVolumes: ['shop-prod-storage-data'], middleware: [{ service: 'storage', action: partial ? 'keep' : 'default' }] } })
  expect(await readdir(directory, { recursive: true })).toEqual(before)
})
