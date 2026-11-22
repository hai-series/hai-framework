/** 显式运行真实生成工程，构建并访问 SvelteKit/serv/fullstack 新路由。 */

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { generateConfigFile } from '../src/commands/cli-config-templates.js'
import { createProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'
import { DeployTestCommandError, runPnpmTestCommand } from './helpers/deploy-test-command.js'

const enabled = process.env.HAI_CLI_RUN_GENERATE_GATES === '1'
const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const tempParent = path.join(repository, 'tmp')
const roots: string[] = []
const processes: Array<{ controller: AbortController, completion: Promise<void>, failure: () => unknown }> = []
const clients: Array<ReturnType<typeof crypto.transport.createClient>> = []
const serverOutputs: Array<() => string> = []
let evidence = ''

beforeAll(async () => {
  if (!enabled)
    return
  const parent = path.join(repository, 'tmp/validation/cli-generate-runtime')
  await mkdir(parent, { recursive: true })
  evidence = await mkdtemp(path.join(parent, 'run-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  const failures: unknown[] = []
  let processCleanupFailed = false
  try {
    // pnpm 退出后才能取得有界诊断；先核验整棵进程树，再持久化日志和清理数据。
    for (const command of processes.splice(0)) {
      try {
        command.controller.abort()
        await command.completion
        const failure = command.failure()
        if (!(failure instanceof DeployTestCommandError && failure.reason === 'abort' && failure.localTermination === 'confirmed')) {
          failures.push(failure)
          if (failure instanceof DeployTestCommandError && failure.localTermination === 'unknown')
            processCleanupFailed = true
        }
      }
      catch (error) {
        if (error instanceof DeployTestCommandError && error.localTermination === 'unknown')
          processCleanupFailed = true
        failures.push(error)
      }
    }
  }
  finally {
    try {
      for (const output of serverOutputs.splice(0))
        await appendFile(path.join(evidence, 'runtime-servers.log'), `${output()}\n`)
    }
    catch (error) {
      failures.push(error)
    }
    for (const root of roots.splice(0)) {
      if (processCleanupFailed)
        continue
      try {
        if (path.dirname(root) !== tempParent || !path.basename(root).startsWith('cli-generate-runtime-')) {
          failures.push(new Error('Unexpected runtime cleanup path'))
          continue
        }
        await rm(root, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        })
      }
      catch (error) {
        failures.push(error)
      }
    }
    for (const client of clients.splice(0)) {
      try {
        client.destroy()
      }
      catch (error) {
        failures.push(error)
      }
    }
    try {
      await crypto.close()
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Generated runtime evidence or cleanup failed')
}, 30_000)

/** 场景输入写入本轮真实模式文件；已有密钥、模块和密码均沿用生成结果。 */
async function configureRuntime(cwd: string, values: Record<string, string>): Promise<void> {
  const root = roots.find(root => cwd.startsWith(`${root}${path.sep}`))
  if (!root)
    throw new Error('Generated runtime requires an owned temporary project')
  const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
  const relative = /run-node\.mjs\s+test\s+(\S+)/.exec(manifest.scripts?.['start:test'] ?? '')?.[1]
  const directory = relative
    ? path.resolve(cwd, relative)
    : cwd
  const file = path.join(directory, '.env.test')
  await writeFile(file, core.config.stringifyEnv({
    ...parseEnv(await readFile(file, 'utf8')),
    ...values,
  }))
}

/** 编译与检查复用生成工程已有脚本；只有定向 lint 使用 pnpm exec。 */
async function tool(name: 'tsup' | 'vite' | 'eslint' | 'typescript', args: string[], cwd: string): Promise<void> {
  const command = name === 'tsup'
    ? ['build']
    : name === 'vite'
      ? ['compile']
      : name === 'typescript'
        ? ['typecheck']
        : ['exec', 'eslint', ...args]
  const output = await runPnpmTestCommand(command, { cwd, timeoutMs: 120_000 })
  await appendFile(path.join(evidence, 'runtime-builds.log'), `${cwd} pnpm ${command.join(' ')}\n${output}\n`)
}

/** 分配本机临时端口，服务通过既有配置入口接收。 */
async function port(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address')
  await new Promise<void>(resolve => server.close(() => resolve()))
  return address.port
}

/** 通过生成工程公开启动脚本等待 HTTP 服务，进程树由既有命令夹具托管。 */
async function start(cwd: string, selectedPort: number, healthPath = '/health'): Promise<string> {
  let output = ''
  let failure: unknown
  serverOutputs.push(() => output)
  const controller = new AbortController()
  await configureRuntime(cwd, {
    PORT: String(selectedPort),
    HOST: '127.0.0.1',
    HAI_SERV_SERVER_PORT: String(selectedPort),
  })
  const completion = runPnpmTestCommand(['start:test'], {
    cwd,
    signal: controller.signal,
  }).then((result) => {
    output = result
    failure = new Error('Generated server exited before cleanup')
  }, (error: unknown) => {
    failure = error
    output = error instanceof Error
      ? error.message
      : String(error)
  })
  processes.push({
    controller,
    completion,
    failure: () => failure,
  })
  const base = `http://127.0.0.1:${selectedPort}`
  for (let attempt = 0; attempt < 120; attempt++) {
    if (failure)
      throw failure
    const response = await fetch(`${base}${healthPath}`).catch(() => null)
    if (response?.ok)
      return base
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Generated server never became ready: ${output}`)
}

describe.skipIf(!enabled)('generated route runtime gates', () => {
  it.each(['mobile-app', 'fullstack'] as const)('%s native naming gates load generated Capacitor configuration and Desktop entry', async (appType) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await mkdir(tempParent, { recursive: true })
    const root = await mkdtemp(path.join(tempParent, 'cli-generate-runtime-'))
    roots.push(root)
    const project = path.join(root, 'native-names')
    await createProject({
      cwd: root,
      name: 'native-names',
      appType,
      frontends: ['app', 'desktop'],
      defaults: true,
      install: false,
      git: false,
      deploy: false,
      packageManager: 'pnpm',
    })
    // 名称来源逐层验证，移除本轮创建器生成的更高优先级环境文件。
    for (const file of [
      '.env',
      '.env.dev',
      '.env.test',
      '.env.prod',
      '.env.local',
      '.env.dev.local',
      '.env.test.local',
      '.env.prod.local',
    ])
      await rm(path.join(project, file), { force: true })
    const app = appType === 'fullstack'
      ? path.join(project, 'apps/native-names-app')
      : project
    const config = path.join(project, appType === 'fullstack'
      ? 'packages/native-names-serv/config/_core.yml'
      : 'config/_core.yml')
    const require = createRequire(import.meta.url)
    const loader = path.join(path.dirname(require.resolve('@capacitor/cli')), 'config.js')
    const probe = `require(${JSON.stringify(loader)}).loadConfig().then(config => process.stdout.write(JSON.stringify({ name: config.app.appName, id: config.app.appId })))`
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:HAI_|PUBLIC_|VITE_)/.test(key)))
    delete env.NODE_ENV
    let appId = ''
    for (const source of ['yaml', 'dotenv', 'process']) {
      await writeFile(config, 'name: "Changed YAML Native"\n')
      if (source !== 'yaml')
        await writeFile(path.join(project, '.env.prod'), 'HAI_CORE_NAME="Changed dotenv Native"\n')
      if (source === 'process')
        env.HAI_CORE_NAME = 'Changed Process Native'
      const result = spawnSync(process.execPath, ['-e', probe], {
        cwd: app,
        env,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(result.status, result.stderr).toBe(0)
      const value: { name: string, id: string } = JSON.parse(result.stdout)
      expect(value.name).toBe(source === 'yaml'
        ? 'Changed YAML Native'
        : source === 'dotenv'
          ? 'Changed dotenv Native'
          : 'Changed Process Native')
      if (!appId)
        appId = value.id
      expect(value.id).toBe(appId)
    }
    if (appType !== 'fullstack')
      return
    const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
    expect(manifest.devDependencies['@h-ai/core']).toBeDefined()
    const desktop = path.join(project, 'apps/native-names-desktop')
    const desktopConfig = JSON.parse(await readFile(path.join(desktop, 'src-tauri/tauri.conf.json'), 'utf8'))
    expect(desktopConfig.plugins?.updater).toBeUndefined()
    for (const file of ['DesktopUpdateEntry.svelte', 'desktop-update.svelte.ts']) {
      expect(await readFile(path.join(desktop, 'src/lib/desktop-update', file), 'utf8'))
        .toBe(await readFile(path.join(repository, 'packages/cli/templates/shared/desktop-update', file), 'utf8'))
    }
    const fakeTool = path.join(desktop, 'node_modules/@tauri-apps/cli')
    await mkdir(fakeTool, { recursive: true })
    await writeFile(path.join(fakeTool, 'tauri.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    const desktopPackage = JSON.parse(await readFile(path.join(desktop, 'package.json'), 'utf8'))
    const workspace = parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8'))
    expect(desktopPackage.dependencies['@tauri-apps/plugin-updater']).toBe('catalog:')
    expect(workspace.catalog['@tauri-apps/plugin-updater']).toMatch(/^2\./)
    const [, runner, ...fixedArgs] = desktopPackage.scripts.tauri.split(' ')
    const result = spawnSync(process.execPath, [
      path.resolve(desktop, runner),
      ...fixedArgs,
      'build',
      '--config',
      '{"version":"2.4.6"}',
    ], {
      cwd: desktop,
      env,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(result.status, result.stderr).toBe(0)
    const args: string[] = JSON.parse(result.stdout)
    expect(JSON.parse(args[2]!)).toMatchObject({
      productName: 'Changed Process Native',
      app: {
        windows: [
          { title: 'Changed Process Native', width: 1280 },
        ],
      },
    })
    expect(args.slice(3)).toEqual(['--config', '{"version":"2.4.6"}'])
  }, 30_000)

  it('website 默认 SSR 在未接入认证和传输加密时可通过 Node 入口运行', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await mkdir(tempParent, { recursive: true })
    const root = await mkdtemp(path.join(tempParent, 'cli-generate-runtime-'))
    roots.push(root)
    await createProject({
      name: 'minimal-site',
      appType: 'website',
      cwd: root,
      defaults: true,
      install: false,
      git: false,
      deploy: false,
      packageManager: 'pnpm',
    })
    const project = path.join(root, 'minimal-site')
    await mkdir(path.join(project, 'node_modules/@inlang'), { recursive: true })
    await symlink(path.join(repository, 'node_modules/@inlang/plugin-message-format'), path.join(project, 'node_modules/@inlang/plugin-message-format'), 'junction')
    await tool('vite', ['build'], project)
    const base = await start(project, await port(), '/api/health')
    expect((await fetch(base)).status).toBe(200)
    expect((await fetch(`${base}/api/health`)).status).toBe(200)
  }, 180_000)

  it('website datapipe 路由处理正文并返回统一校验错误', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await mkdir(tempParent, { recursive: true })
    const root = await mkdtemp(path.join(tempParent, 'cli-generate-runtime-'))
    roots.push(root)
    const name = 'datapipe-site'
    await createProject({
      name,
      appType: 'website',
      cwd: root,
      defaults: true,
      install: false,
      git: false,
      deploy: false,
      packageManager: 'pnpm',
    })
    const project = path.join(root, name)
    await generateFromTemplates(project, buildTemplateContext({
      name,
      appType: 'website',
      features: ['datapipe'],
      packageManager: 'pnpm',
      deploy: false,
    }))
    const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
    expect(manifest.dependencies).toHaveProperty('@h-ai/datapipe', 'catalog:')
    await mkdir(path.join(project, 'node_modules/@inlang'), { recursive: true })
    await symlink(path.join(repository, 'node_modules/@inlang/plugin-message-format'), path.join(project, 'node_modules/@inlang/plugin-message-format'), 'junction')
    await tool('typescript', [], project)
    await tool('vite', ['build'], project)
    const base = await start(project, await port(), '/api/health')

    const requestId = 'datapipe-scaffold-request'
    const endpoint = `${base}/api/datapipe/pipeline`
    const requestOptions = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': base, 'x-request-id': requestId },
    }
    const accepted = await fetch(endpoint, {
      ...requestOptions,
      body: JSON.stringify({ content: '<p>Sample report.</p>' }),
    })
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({
      success: true,
      requestId,
      data: {
        cleaned: 'Sample report.',
        chunkCount: 1,
        chunks: [
          { index: 0, content: 'Sample report.' },
        ],
      },
    })

    const rejected = await fetch(endpoint, {
      ...requestOptions,
      body: JSON.stringify({ content: '  ' }),
    })
    expect(rejected.status).toBe(400)
    expect(rejected.headers.get('x-trace-id')).toBe(requestId)
    expect(await rejected.json()).toMatchObject({
      success: false,
      requestId,
      error: { code: HaiCommonError.INVALID_REQUEST.code, traceId: requestId },
    })
  }, 180_000)

  it.each(['website', 'api', 'fullstack'] as const)('%s生成的新路由进入实际构建与HTTP入口', async (appType) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await mkdir(tempParent, { recursive: true })
    const root = await mkdtemp(path.join(tempParent, 'cli-generate-runtime-'))
    roots.push(root)
    await createProject({
      name: 'runtime-route',
      appType,
      frontends: ['web'],
      cwd: root,
      defaults: true,
      install: false,
      git: false,
      deploy: false,
      packageManager: 'pnpm',
    })
    const project = path.join(root, 'runtime-route')
    if (appType === 'website') {
      // 官网默认不接认证；本场景显式接入 IAM，保留生成业务路由的真实会话验收。
      await generateFromTemplates(project, buildTemplateContext({
        name: 'runtime-route',
        appType,
        features: ['iam'],
        packageManager: 'pnpm',
        deploy: false,
      }))
      for (const module of ['db', 'cache', 'iam'])
        await writeFile(path.join(project, 'config', `_${module}.yml`), generateConfigFile(module))
    }
    await generate({ type: 'api', name: 'route-probe', cwd: project })
    if (appType !== 'website')
      await generate({ type: 'api', name: 'aardvark-probe', cwd: project })
    const selectedPort = await port()
    let base: string
    let request: typeof fetch = fetch
    if (appType === 'website') {
      // 本门禁验证生成路由和真实会话；验证码的完整交互由脚手架浏览器门禁验证。
      await configureRuntime(project, { HAI_IAM_CAPTCHA_ENABLED: 'false', HAI_IAM_REGISTER_ENABLED: 'true' })
      // Paraglide 工程以 ./node_modules 显式加载插件；复用本仓库已安装的同版本依赖。
      await mkdir(path.join(project, 'node_modules/@inlang'), { recursive: true })
      await symlink(path.join(repository, 'node_modules/@inlang/plugin-message-format'), path.join(project, 'node_modules/@inlang/plugin-message-format'), 'junction')
      await generate({ type: 'page', name: 'route-page', cwd: project })
      await tool('vite', ['build'], project)
      base = await start(project, selectedPort, '/api/health')
      const page = await fetch(`${base}/route-page`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('RoutePage')
      expect((await fetch(`${base}/api/route-probe`)).status).toBe(401)
      const registered = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': base },
        body: JSON.stringify({ username: `route${randomBytes(6).toString('hex')}`, password: `Aa1!${randomBytes(24).toString('base64url')}` }),
      })
      expect(registered.status).toBe(200)
      expect(await registered.json()).toMatchObject({ success: true })
      const cookie = registered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      expect(cookie.length).toBeGreaterThan(0)
      request = (input, init) => {
        const authenticated = new Request(input, init)
        authenticated.headers.set('cookie', cookie)
        authenticated.headers.set('origin', base)
        return fetch(authenticated)
      }
    }
    else {
      const parent = appType === 'api'
        ? 'apps'
        : 'packages'
      const contract = path.join(project, parent, 'runtime-route-contract')
      const service = path.join(project, parent, 'runtime-route-serv')
      // YAML 不声明可选路径时，实际启动仍须通过模块 Schema 识别细项。
      await writeFile(path.join(service, 'config/_db.yml'), 'type: sqlite\n')
      await mkdir(path.join(service, 'node_modules'), { recursive: true })
      await symlink(contract, path.join(service, 'node_modules/runtime-route-contract'), 'junction')
      await tool('tsup', [], contract)
      await tool('eslint', [
        'src/route-probe-contract.ts',
        'src/aardvark-probe-contract.ts',
        'src/runtime-route-contract.ts',
        'src/index.ts',
      ], contract)
      await tool('eslint', ['src/server/procedures/route-probe-procedures.ts', 'src/server/procedures/aardvark-probe-procedures.ts', 'src/server/procedures/index.ts'], service)
      await tool('typescript', ['--noEmit'], service)
      await tool('tsup', [], service)
      const environmentRoot = appType === 'api'
        ? service
        : project
      const expectFailure = async (expected: string[]) => {
        let output = ''
        serverOutputs.push(() => `${appType} failure ${expected.join(', ')}\n${output}`)
        let failure: unknown
        try {
          await runPnpmTestCommand(['start:test'], {
            cwd: service,
            timeoutMs: 15_000,
          })
        }
        catch (error) {
          failure = error
          output = error instanceof Error
            ? error.message
            : String(error)
        }
        expect(failure).toBeInstanceOf(DeployTestCommandError)
        expect(failure).toMatchObject({ reason: 'exit', localTermination: 'confirmed', exitCode: 1 })
        for (const text of expected)
          expect(output).toContain(text)
        await appendFile(path.join(evidence, 'startup-diagnostics.log'), `${appType}: ${expected.join(', ')}\n${output}\n`)
      }
      const expectMissing = async (name: string, expected: string[]) => {
        const backups = new Map<string, string>()
        for (const file of [
          '.env',
          '.env.test',
          '.env.local',
          '.env.test.local',
        ]) {
          const target = path.join(environmentRoot, file)
          const original = await readFile(target, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT')
              throw error
            return undefined
          })
          if (original !== undefined)
            backups.set(target, original)
        }
        try {
          // 真正删除当前所有加载层的字段，不用子进程 env 覆盖模拟缺失。
          for (const [file, original] of backups)
            await writeFile(file, original.split('\n').filter(line => !line.startsWith(`${name}=`)).join('\n'))
          await expectFailure([name, ...expected])
        }
        finally {
          for (const [file, original] of backups) await writeFile(file, original)
        }
      }
      if (appType === 'fullstack') {
        await expectMissing('HAI_ADMIN_DEFAULT_PASSWORD', [
          'bootstrap',
          'hai:core:013',
          '未设置必需的环境变量',
          '.env',
        ])
      }
      base = await start(service, selectedPort)
      expect((await readFile(path.join(service, 'data/test/app.db'))).subarray(0, 16).toString()).toBe('SQLite format 3\0')
      await expectFailure([
        'EADDRINUSE',
        String(selectedPort),
      ])
      if (appType === 'fullstack') {
        await expectMissing('HAI_CRYPTO_TRANSPORT_SERVERKEYRING', ['hai:crypto:'])
      }
      // API 与 Fullstack 的认证场景通过真实加密客户端访问。
      expect((await fetch(`${base}/api/v1/route-probe`)).status).toBe(400)
      expect((await crypto.init()).success).toBe(true)
      const client = crypto.transport.createClient({ keyExchangeUrl: `${base}/api/v1/_hai/key-exchange` })
      clients.push(client)
      request = client.encryptedFetch
    }
    const prefix = appType === 'website'
      ? '/api'
      : '/api/v1'
    const list = await request(`${base}${prefix}/route-probe`)
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      success: true,
      data: { items: [] },
    })
    if (appType !== 'website')
      expect((await request(`${base}${prefix}/aardvark-probe`)).status).toBe(200)
    const created = await request(`${base}${prefix}/route-probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Actual HTTP route' }),
    })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({
      success: true,
      data: { name: 'Actual HTTP route' },
    })
    const invalid = await request(`${base}${prefix}/route-probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(invalid.status).toBe(400)
  }, 180_000)
})
