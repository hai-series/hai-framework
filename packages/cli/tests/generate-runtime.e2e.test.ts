/** 显式运行真实生成工程，构建并访问 SvelteKit/serv/fullstack 新路由。 */

import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { crypto } from '@h-ai/crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'

const enabled = process.env.HAI_CLI_RUN_GENERATE_GATES === '1'
const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const tempParent = path.join(repository, 'tmp')
const roots: string[] = []
const processes: ChildProcess[] = []
const clients: Array<ReturnType<typeof crypto.transport.createClient>> = []
const serverOutputs: Array<() => string> = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const output of serverOutputs.splice(0))
    await appendFile(path.join(repository, 'tmp/module-repair-20261022/CLI-01/runtime-servers.log'), `${output()}\n`)
  for (const child of processes.splice(0)) {
    if (child.exitCode !== null)
      continue
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Generated server did not close')), 15_000)
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill()
    })
  }
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== tempParent || !path.basename(root).startsWith('cli-generate-runtime-'))
      throw new Error('Unexpected runtime cleanup path')
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
  for (const client of clients.splice(0))
    client.destroy()
  await crypto.close()
})

/** 从已安装工具的真实 bin 启动，复用仓库依赖，不触发自动 install 或全量构建。 */
async function tool(name: 'tsup' | 'vite' | 'eslint' | 'typescript', args: string[], cwd: string): Promise<void> {
  const manifestPath = fileURLToPath(import.meta.resolve(`${name}/package.json`))
  const manifest: { bin: Record<string, string> } = JSON.parse(await readFile(manifestPath, 'utf8'))
  const result = spawnSync(process.execPath, [path.join(path.dirname(manifestPath), manifest.bin[name === 'typescript' ? 'tsc' : name]!), ...args], { cwd, windowsHide: true, encoding: 'utf8', timeout: 120_000, env: { ...process.env, HAI_E2E: '1', NODE_ENV: 'test' } })
  await appendFile(path.join(repository, 'tmp/module-repair-20261022/CLI-01/runtime-builds.log'), `${cwd}\n${result.stdout}\n${result.stderr}\n`)
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
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'test', HAI_E2E: '1', HAI_CORE_ENV: 'test', PORT: String(selectedPort), HOST: '127.0.0.1', HAI_SERV_SERVER_PORT: String(selectedPort) } })
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
    await createProject({ name: 'runtime-route', appType, template: 'minimal', features: [], frontends: ['web'], cwd: root, yes: true, install: false, git: false, deploy: false, examples: false, packageManager: 'pnpm' })
    const project = path.join(root, 'runtime-route')
    await generate({ type: 'api', name: 'route-probe', cwd: project })
    if (appType !== 'website')
      await generate({ type: 'api', name: 'aardvark-probe', cwd: project })
    const selectedPort = await port()
    let base: string
    let request: typeof fetch = fetch
    if (appType === 'website') {
      // Paraglide 工程以 ./node_modules 显式加载插件；复用本仓库已安装的同版本依赖。
      await mkdir(path.join(project, 'node_modules/@inlang'), { recursive: true })
      await symlink(path.join(repository, 'node_modules/@inlang/plugin-message-format'), path.join(project, 'node_modules/@inlang/plugin-message-format'), 'junction')
      await generate({ type: 'page', name: 'route-page', cwd: project })
      await tool('vite', ['build'], project)
      base = await start(project, ['--env-file=.env', '--env-file=.env.dev', '--env-file-if-exists=.env.local', 'build/index.js'], selectedPort)
      const page = await fetch(`${base}/route-page`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('RoutePage')
    }
    else {
      const parent = appType === 'api' ? 'apps' : 'packages'
      const contract = path.join(project, parent, 'runtime-route-contract')
      const service = path.join(project, parent, `runtime-route-${appType === 'api' ? 'service' : 'serv'}`)
      await mkdir(path.join(service, 'node_modules'), { recursive: true })
      await symlink(contract, path.join(service, 'node_modules/runtime-route-contract'), 'junction')
      await tool('tsup', [], contract)
      await tool('eslint', ['src/route-probe-contract.ts', 'src/aardvark-probe-contract.ts', 'src/runtime-route-contract.ts', 'src/index.ts'], contract)
      await tool('eslint', ['src/server/procedures/route-probe-procedures.ts', 'src/server/procedures/aardvark-probe-procedures.ts', 'src/server/procedures/index.ts'], service)
      await tool('typescript', ['--noEmit'], service)
      await tool('tsup', [], service)
      const environmentRoot = appType === 'api' ? service : project
      base = await start(service, [`--env-file=${path.join(environmentRoot, '.env')}`, `--env-file=${path.join(environmentRoot, '.env.dev')}`, `--env-file-if-exists=${path.join(environmentRoot, '.env.local')}`, 'dist/index.js'], selectedPort)
      if (appType === 'fullstack') {
        expect((await crypto.init()).success).toBe(true)
        const client = crypto.transport.createClient({ keyExchangeUrl: `${base}/api/v1/_hai/key-exchange` })
        clients.push(client)
        request = client.encryptedFetch
      }
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
