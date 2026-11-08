import type { AppType } from '../src/cli-types.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it.each([
  'admin',
  'website',
  'h5',
  'api',
  'mobile-app',
  'fullstack',
] as const)('%s 只安装实际模块，保留全部配置和环境变量参考', async (appType: AppType) => {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-module-boundaries-'))
  roots.push(root)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  await createProject({
    name: 'sample',
    appType,
    frontends: ['web'],
    defaults: true,
    install: false,
    git: false,
    packageManager: 'pnpm',
    cwd: root,
  })
  const project = path.join(root, 'sample')
  const service = appType === 'api'
    ? path.join(project, 'apps/sample-serv')
    : appType === 'fullstack'
      ? path.join(project, 'packages/sample-serv')
      : project
  const manifest = JSON.parse(await readFile(path.join(service, 'package.json'), 'utf8')) as { dependencies: Record<string, string>, devDependencies: Record<string, string> }
  const workspace = parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8')) as { catalog: Record<string, string> }
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (version === 'catalog:')
      expect(workspace.catalog[name], `Missing catalog entry: ${name}`).toBeTruthy()
  }
  for (const module of ['ai', 'payment', 'vecdb', 'datapipe']) {
    expect(manifest.dependencies[`@h-ai/${module}`]).toBeUndefined()
  }
  for (const module of ['ai', 'payment', 'vecdb'])
    expect(parse(await readFile(path.join(service, 'config', `_${module}.yml`), 'utf8'))).toBeNull()
  for (const module of [
    'core',
    'kit',
    'serv',
    'db',
    'cache',
    'iam',
    'storage',
    'audit',
    'reach',
    'ai',
    'vecdb',
    'payment',
    'scheduler',
    'feedback',
  ])
    expect(await readFile(path.join(service, 'config', `_${module}.yml`), 'utf8')).toBeTruthy()
  const environment = await readFile(path.join(service === project || appType === 'fullstack'
    ? project
    : service, '.env.example'), 'utf8')
  for (const name of [
    'HAI_AI_LLM_APIKEY',
    'HAI_VECDB_TYPE',
    'HAI_PAYMENT_WECHAT_APPID',
    'HAI_IAM_LDAP_URL',
    'HAI_KIT_TRANSPORT_KEYEXCHANGEPATH',
    'HAI_SERV_HTTP_APIPREFIX',
  ])
    expect(environment.includes(`${name}=`), name).toBe(true)
  for (const filename of ['.env', '.env.prod']) {
    const values = parseEnv(await readFile(path.join(service === project || appType === 'fullstack'
      ? project
      : service, filename), 'utf8'))
    expect(Object.keys(values).some(name => /^HAI_(?:AI|VECDB|PAYMENT)_/.test(name))).toBe(false)
  }
  if (appType === 'website') {
    for (const module of [
      'iam',
      'cache',
      'reldb',
      'crypto',
      'storage',
      'audit',
      'reach',
      'scheduler',
      'feedback',
    ])
      expect(manifest.dependencies[`@h-ai/${module}`]).toBeUndefined()
    expect(parse(await readFile(path.join(service, 'config/_iam.yml'), 'utf8'))).toBeNull()
  }
  if (appType === 'mobile-app') {
    expect(manifest.devDependencies['@h-ai/core']).toBe('catalog:')
    expect(manifest.devDependencies['@h-ai/api-contract']).toBe('catalog:')
    expect(manifest.dependencies['pino-pretty']).toBeUndefined()
    for (const module of [
      'iam',
      'cache',
      'reldb',
      'storage',
      'audit',
      'reach',
      'scheduler',
      'feedback',
    ])
      expect(manifest.dependencies[`@h-ai/${module}`]).toBeUndefined()
  }
})
