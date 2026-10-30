/** 显式运行真实生成工程，构建并访问 SvelteKit/serv/fullstack 新路由。 */

import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { crypto } from '@h-ai/crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createE2eServerEnv, createE2eTransportRing } from '../../../scripts/e2e-env.js'
import { createProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'

const enabled = process.env.HAI_CLI_RUN_GENERATE_GATES === '1'
const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const tempParent = path.join(repository, 'tmp')
const roots: string[] = []
const processes: ChildProcess[] = []
const clients: Array<ReturnType<typeof crypto.transport.createClient>> = []
const serverOutputs: Array<() => string> = []
const environments = new Map<string, NodeJS.ProcessEnv>()
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
  try {
    for (const output of serverOutputs.splice(0))
      await appendFile(path.join(evidence, 'runtime-servers.log'), `${output()}\n`)
  }
  catch (error) {
    failures.push(error)
  }
  finally {
    // 日志持久化失败也必须收回所有句柄；任一清理失败不能阻断其他独立资源的回收。
    let processCleanupFailed = false
    for (const child of processes.splice(0)) {
      try {
        if (child.exitCode !== null || child.signalCode !== null)
          continue
        await new Promise<void>((resolve, reject) => {
          let forced = false
          let forcedDeadline: ReturnType<typeof setTimeout> | undefined
          const timer = setTimeout(() => {
            forced = true
            child.kill('SIGKILL')
            forcedDeadline = setTimeout(() => reject(new Error('Generated server termination could not be confirmed')), 5000)
          }, 15_000)
          child.once('error', (error) => {
            clearTimeout(timer)
            clearTimeout(forcedDeadline)
            reject(error)
          })
          child.once('close', () => {
            clearTimeout(timer)
            clearTimeout(forcedDeadline)
            if (forced)
              reject(new Error('Generated server required forced shutdown'))
            else resolve()
          })
          child.kill()
        })
      }
      catch (error) {
        processCleanupFailed = true
        failures.push(error)
      }
    }
    for (const root of roots.splice(0)) {
      if (processCleanupFailed)
        continue
      try {
        if (path.dirname(root) !== tempParent || !path.basename(root).startsWith('cli-generate-runtime-')) {
          failures.push(new Error('Unexpected runtime cleanup path'))
          continue
        }
        await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      }
      catch (error) {
        failures.push(error)
      }
      environments.delete(root)
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

/** 编译器和真实服务仅使用本轮明确后端；不继承开发者的模块或私有 dotenv 配置。 */
function runtimeEnvironment(cwd: string): NodeJS.ProcessEnv {
  const root = roots.find(root => cwd.startsWith(`${root}${path.sep}`))
  if (!root)
    throw new Error('Generated runtime requires an owned temporary project')
  let env = environments.get(root)
  if (!env) {
    const data = path.join(root, 'runtime-data')
    env = {
      ...process.env,
      ...createE2eServerEnv({
        HAI_E2E_DATA_ROOT: data,
        HAI_CORE_ENV: 'test',
        HAI_DB: JSON.stringify({ type: 'sqlite', database: path.join(data, 'app.db') }),
        HAI_CACHE: JSON.stringify({ type: 'memory' }),
        HAI_STORAGE: JSON.stringify({ type: 'local', root: path.join(data, 'uploads') }),
        HAI_VECDB: JSON.stringify({ type: 'lancedb', path: path.join(data, 'vecdb') }),
        HAI_CRYPTO_TRANSPORT_SERVERKEYRING: createE2eTransportRing(),
        HAI_ADMIN_DEFAULT_PASSWORD: `Aa1!${randomBytes(24).toString('base64url')}`,
      }),
    }
    environments.set(root, env)
  }
  return env
}

/** 从已安装工具的真实 bin 启动，复用仓库依赖，不触发自动 install 或全量构建。 */
async function tool(name: 'tsup' | 'vite' | 'eslint' | 'typescript', args: string[], cwd: string): Promise<void> {
  const manifestPath = fileURLToPath(import.meta.resolve(`${name}/package.json`))
  const manifest: { bin: Record<string, string> } = JSON.parse(await readFile(manifestPath, 'utf8'))
  const result = spawnSync(process.execPath, [path.join(path.dirname(manifestPath), manifest.bin[name === 'typescript' ? 'tsc' : name]!), ...args], { cwd, windowsHide: true, encoding: 'utf8', timeout: 120_000, env: runtimeEnvironment(cwd) })
  await appendFile(path.join(evidence, 'runtime-builds.log'), `${cwd}\n${result.stdout}\n${result.stderr}\n`)
  expect(result.error?.message).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
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

/** 启动实际编译入口并等待 HTTP 服务，失败保留有界日志。 */
async function start(cwd: string, args: string[], selectedPort: number): Promise<string> {
  let output = ''
  serverOutputs.push(() => output)
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...runtimeEnvironment(cwd), PORT: String(selectedPort), HOST: '127.0.0.1', HAI_SERV_SERVER_PORT: String(selectedPort) } })
  processes.push(child)
  const capture = (data: Buffer) => {
    output = (output + data.toString()).slice(-16_000)
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  const base = `http://127.0.0.1:${selectedPort}`
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Generated server exited: ${output}`)
    if (await fetch(`${base}/health`).catch(() => null))
      return base
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Generated server never became ready: ${output}`)
}

describe.skipIf(!enabled)('generated route runtime gates', () => {
  it.each(['website', 'api', 'fullstack'] as const)('%s生成的新路由进入实际构建与HTTP入口', async (appType) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await mkdir(tempParent, { recursive: true })
    const root = await mkdtemp(path.join(tempParent, 'cli-generate-runtime-'))
    roots.push(root)
    await createProject({ name: 'runtime-route', appType, frontends: ['web'], cwd: root, defaults: true, install: false, git: false, deploy: false, packageManager: 'pnpm' })
    const project = path.join(root, 'runtime-route')
    await generate({ type: 'api', name: 'route-probe', cwd: project })
    if (appType !== 'website')
      await generate({ type: 'api', name: 'aardvark-probe', cwd: project })
    const selectedPort = await port()
    let base: string
    let request: typeof fetch = fetch
    if (appType === 'website') {
      // 本门禁验证生成路由和真实会话；验证码的完整交互由脚手架浏览器门禁验证。
      runtimeEnvironment(project).HAI_IAM_CAPTCHA_ENABLED = 'false'
      runtimeEnvironment(project).HAI_IAM_REGISTER_ENABLED = 'true'
      // Paraglide 工程以 ./node_modules 显式加载插件；复用本仓库已安装的同版本依赖。
      await mkdir(path.join(project, 'node_modules/@inlang'), { recursive: true })
      await symlink(path.join(repository, 'node_modules/@inlang/plugin-message-format'), path.join(project, 'node_modules/@inlang/plugin-message-format'), 'junction')
      await generate({ type: 'page', name: 'route-page', cwd: project })
      await tool('vite', ['build'], project)
      base = await start(project, ['--env-file=.env', '--env-file=.env.dev', 'build/index.js'], selectedPort)
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
      const parent = appType === 'api' ? 'apps' : 'packages'
      const contract = path.join(project, parent, 'runtime-route-contract')
      const service = path.join(project, parent, 'runtime-route-serv')
      await mkdir(path.join(service, 'node_modules'), { recursive: true })
      await symlink(contract, path.join(service, 'node_modules/runtime-route-contract'), 'junction')
      await tool('tsup', [], contract)
      await tool('eslint', ['src/route-probe-contract.ts', 'src/aardvark-probe-contract.ts', 'src/runtime-route-contract.ts', 'src/index.ts'], contract)
      await tool('eslint', ['src/server/procedures/route-probe-procedures.ts', 'src/server/procedures/aardvark-probe-procedures.ts', 'src/server/procedures/index.ts'], service)
      await tool('typescript', ['--noEmit'], service)
      await tool('tsup', [], service)
      const environmentRoot = appType === 'api' ? service : project
      // 模拟克隆工程没有本机覆盖文件；正常运行仍使用本轮隔离后端。
      await rm(path.join(environmentRoot, '.env.local'), { force: true })
      const entryArgs = [`--env-file=${path.join(environmentRoot, '.env')}`, `--env-file=${path.join(environmentRoot, '.env.dev')}`, 'dist/index.js']
      const expectFailure = async (override: NodeJS.ProcessEnv, expected: string[]) => {
        let output = ''
        serverOutputs.push(() => `${appType} failure ${expected.join(', ')}\n${output}`)
        const child = spawn(process.execPath, entryArgs, { cwd: service, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...runtimeEnvironment(service), PORT: String(selectedPort), HOST: '127.0.0.1', HAI_SERV_SERVER_PORT: String(selectedPort), ...override } })
        processes.push(child)
        child.stdout?.on('data', (chunk: Buffer) => output = (output + chunk.toString()).slice(-16_000))
        child.stderr?.on('data', (chunk: Buffer) => output = (output + chunk.toString()).slice(-16_000))
        const code = await new Promise<number | null>((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill()
            reject(new Error(`Startup failure did not release its resources (${expected.join(', ')}): ${output}`))
          }, 15_000)
          child.once('error', (error) => {
            clearTimeout(timer)
            reject(error)
          })
          child.once('close', (code) => {
            clearTimeout(timer)
            resolve(code)
          })
        })
        expect(code, output).toBe(1)
        for (const text of expected)
          expect(output).toContain(text)
        await appendFile(path.join(evidence, 'startup-diagnostics.log'), `${appType}: ${expected.join(', ')}\n${output}\n`)
      }
      const expectMissing = async (name: string, expected: string[]) => {
        const profilePath = path.join(environmentRoot, '.env.dev')
        const profile = await readFile(profilePath, 'utf8')
        try {
          // Windows 可能省略空环境值；真正移除环境文件中的值才能模拟配置缺失。
          await writeFile(profilePath, profile.split('\n').filter(line => !line.startsWith(`${name}=`)).join('\n'))
          await expectFailure({ [name]: undefined }, [name, ...expected])
        }
        finally {
          await writeFile(profilePath, profile)
        }
      }
      if (appType === 'fullstack')
        await expectMissing('HAI_ADMIN_DEFAULT_PASSWORD', ['bootstrap', 'hai:core:013', '未设置必需的环境变量', '.env'])
      base = await start(service, entryArgs, selectedPort)
      await expectFailure({}, ['EADDRINUSE', String(selectedPort)])
      if (appType === 'fullstack') {
        await expectMissing('HAI_CRYPTO_TRANSPORT_SERVERKEYRING', ['hai:crypto:'])
      }
      // create 固定完整模块后，API 与 Fullstack 都通过真实加密客户端访问。
      expect((await fetch(`${base}/api/v1/route-probe`)).status).toBe(400)
      expect((await crypto.init()).success).toBe(true)
      const client = crypto.transport.createClient({ keyExchangeUrl: `${base}/api/v1/_hai/key-exchange` })
      clients.push(client)
      request = client.encryptedFetch
    }
    const prefix = appType === 'website' ? '/api' : '/api/v1'
    const list = await request(`${base}${prefix}/route-probe`)
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ success: true, data: { items: [] } })
    if (appType !== 'website')
      expect((await request(`${base}${prefix}/aardvark-probe`)).status).toBe(200)
    const created = await request(`${base}${prefix}/route-probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Actual HTTP route' }) })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ success: true, data: { name: 'Actual HTTP route' } })
    const invalid = await request(`${base}${prefix}/route-probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '' }) })
    expect(invalid.status).toBe(400)
  }, 180_000)
})
