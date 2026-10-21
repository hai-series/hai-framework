/**
 * 真实样板门禁 E2E。
 *
 * 默认跳过，避免常规单测安装依赖与启动浏览器过慢。
 * 显式运行：pnpm --filter @h-ai/cli test:scaffold-gates
 */

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const runScaffoldGates = process.env.HAI_CLI_RUN_SCAFFOLD_GATES === '1'
const cliBin = path.resolve(process.cwd(), 'dist/index.js')
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const tempRoots = new Set<string>()
const localPackageSpecifiers = parseLocalPackageSpecifiers(process.env.HAI_CLI_PACKAGE_SPECIFIERS)
let notificationUrl = ''
let closeNotifications: (() => Promise<void>) | undefined

interface ScaffoldGateCase {
  title: string
  projectName: string
  createArgs: string[]
  expectedFiles: string[]
}

interface GateEnvOptions {
  baseUrl?: string
  serviceBaseUrl?: string
  publicApiBase?: string
  frontendUrls?: Record<string, string>
}

const scaffoldGateCases: readonly ScaffoldGateCase[] = [
  {
    title: 'api',
    projectName: 'sample-api',
    createArgs: ['--type', 'api', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-service.spec.ts', 'apps/sample-api-service/package.json'],
  },
  {
    title: 'admin',
    projectName: 'sample-admin',
    createArgs: ['--type', 'admin', '--template', 'custom', '--features', 'iam,db,cache,crypto,storage,ai,audit,reach', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts', 'src/routes/api/auth/login/+server.ts'],
  },
  {
    title: 'api-iam',
    projectName: 'sample-api-iam',
    createArgs: ['--type', 'api', '--template', 'custom', '--features', 'iam,db,cache,reach', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-service.spec.ts', 'apps/sample-api-iam-service/config/_iam.yml'],
  },
  {
    title: 'api-iam-basic',
    projectName: 'sample-api-iam-basic',
    createArgs: ['--type', 'api', '--template', 'custom', '--features', 'iam,db,cache', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-service.spec.ts', 'apps/sample-api-iam-basic-service/config/_iam.yml'],
  },
  {
    title: 'website',
    projectName: 'sample-website',
    createArgs: ['--type', 'website', '--template', 'custom', '--features', 'iam,db,cache,reach', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts'],
  },
  {
    title: 'h5',
    projectName: 'sample-h5',
    createArgs: ['--type', 'h5', '--template', 'custom', '--features', 'iam,db,cache,reach', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts'],
  },
  {
    title: 'mobile-app',
    projectName: 'sample-mobile',
    createArgs: ['--type', 'mobile-app', '--template', 'custom', '--features', 'api-client,capacitor,iam', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts', 'src/App.svelte'],
  },
  {
    title: 'fullstack',
    projectName: 'sample-fullstack',
    createArgs: ['--type', 'fullstack', '--frontends', 'web,app,miniapp,desktop', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm'],
    expectedFiles: ['e2e/fullstack.spec.ts', 'packages/sample-fullstack-serv/package.json'],
  },
] as const

beforeAll(async () => {
  if (!runScaffoldGates)
    return
  notificationUrl = await allocateBaseUrl()
  const fixture = spawn(process.execPath, [path.resolve(process.cwd(), '../../apps/admin-console/e2e/notification-fixture.mjs')], {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, IAM_NOTIFICATION_PORT: new URL(notificationUrl).port, IAM_FIXTURE_LDAP: '0' },
  })
  closeNotifications = async () => {
    if (fixture.exitCode !== null)
      return
    await new Promise<void>((resolve) => {
      fixture.once('exit', () => resolve())
      fixture.kill()
    })
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (fixture.exitCode !== null)
      throw new Error('Notification fixture exited before ready')
    if ((await fetch(notificationUrl).catch(() => null))?.ok)
      return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Notification fixture did not become ready')
}, 60_000)

afterAll(async () => {
  await closeNotifications?.()
  // 只收尾未完成场景；Windows 不同时递归删除多个大型 node_modules，避免磁盘争用。
  for (const root of tempRoots)
    await removeTempRoot(root)
}, 300_000)

describe.skipIf(!runScaffoldGates)('generated scaffold quality gates', () => {
  for (const scenario of scaffoldGateCases) {
    it(`${scenario.title} scaffold passes install, typecheck, lint, build, unit and e2e`, async () => {
      const root = await createTempRoot()
      const projectPath = path.join(root, scenario.projectName)
      const baseUrl = await allocateBaseUrl()
      const envOptions: GateEnvOptions = { baseUrl }

      if (scenario.title === 'fullstack') {
        envOptions.serviceBaseUrl = await allocateBaseUrl()
        envOptions.frontendUrls = { app: await allocateBaseUrl(), desktop: await allocateBaseUrl() }
      }

      runNode([
        cliBin,
        '--cwd',
        root,
        'create',
        scenario.projectName,
        ...scenario.createArgs,
      ])
      await replaceHaiPackageSpecifiers(projectPath)
      await addLocalHaiOverrides(projectPath)
      await removeReplacedHaiCatalogEntries(projectPath)
      if (scenario.title === 'fullstack' || scenario.title === 'mobile-app') {
        const pageRoot = scenario.title === 'fullstack'
          ? `packages/${scenario.projectName}-shared/src/lib/pages`
          : 'src/lib/pages'
        // 生成后只新增页面文件，禁止修改路由器或菜单，验证页面目录自动发现。
        await writeFile(path.join(projectPath, pageRoot, 'auto-discovered.svelte'), '<section data-testid=\'route-probe\'>Scaffold discovered page</section>\n')
        const discovery = await readFile(path.resolve(process.cwd(), 'tests/fixtures/hash-discovery.ts'), 'utf8')
        await writeFile(path.join(projectPath, 'e2e/hash-discovery.spec.ts'), discovery.replaceAll('SCAFFOLD_HASH_APP_TYPE', scenario.title))
      }
      if (scenario.title === 'admin' || scenario.title === 'fullstack') {
        // 验证实际安装的 tarball 公共类型与运行行为，不能只靠框架源码别名。
        const moduleRoot = scenario.title === 'fullstack' ? `packages/${scenario.projectName}-serv` : '.'
        const testsRoot = path.join(projectPath, moduleRoot, 'tests')
        const fixtures = path.resolve(process.cwd(), 'tests/fixtures')
        await writeFile(path.join(testsRoot, 'public-capabilities.test.ts'), await readFile(path.join(fixtures, 'public-capabilities.ts')))
        const include = [`${moduleRoot}/tests/public-capabilities.test.ts`]
        if (scenario.title === 'fullstack') {
          await writeFile(path.join(testsRoot, 'public-client-ip.test.ts'), await readFile(path.join(fixtures, 'public-client-ip.ts')))
          include.push(`${moduleRoot}/tests/public-client-ip.test.ts`)
        }
        await writeFile(path.join(projectPath, 'tsconfig.capabilities.json'), `${JSON.stringify({
          extends: `./${moduleRoot}/tsconfig.json`,
          compilerOptions: { types: ['node'], noEmit: true },
          include,
          exclude: ['node_modules'],
        }, null, 2)}\n`)
      }
      if (scenario.title === 'admin') {
        // 不只验证 create：增量生成的文件必须进入实际项目的编译、lint 与运行测试。
        for (const [type, name, output] of [
          ['page', 'review-page', 'src/routes'],
          ['component', 'ReviewCard', 'src/lib/components'],
          ['api', 'review-api', 'src/routes/api'],
          ['model', 'review-model', 'src/lib/models'],
          ['migration', 'review-records', 'src/lib/server/migrations'],
        ]) {
          runNode([cliBin, '--cwd', projectPath, 'generate', type, name, '--output', output])
        }
        const migrationDir = path.join(projectPath, 'src/lib/server/migrations')
        const migration = (await readdir(migrationDir)).find(name => name.endsWith('_review_records.ts'))!
        await writeFile(path.join(projectPath, 'tests/generated-migration.test.ts'), `import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { down, up } from '../src/lib/server/migrations/${migration.replace(/\.ts$/, '')}'

it('generated migration executes up and down with HaiResult', async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  try {
    expect((await up()).success).toBe(true)
    expect((await reldb.sql.query('SELECT * FROM hai_app_review_records')).success).toBe(true)
    expect((await down()).success).toBe(true)
    expect((await reldb.sql.query('SELECT * FROM hai_app_review_records')).success).toBe(false)
  }
  finally {
    await reldb.close()
  }
})
`)
      }
      if (scenario.title === 'mobile-app') {
        envOptions.serviceBaseUrl = await allocateBaseUrl()
        envOptions.publicApiBase = `${envOptions.serviceBaseUrl}/api/v1`
        const closeService = await startNativeApiService(root, envOptions.serviceBaseUrl)
        try {
          runQualityGates(projectPath, envOptions)
        }
        finally { await closeService() }
      }
      else {
        runQualityGates(projectPath, envOptions)
      }

      for (const relativePath of scenario.expectedFiles) {
        expect(await fileExists(path.join(projectPath, relativePath))).toBe(true)
      }
      for (const resource of ['SKILL.md', 'workflow.md', 'templates.md', 'changes.md']) {
        // 从实际 CLI 构建生成，工作流入口及其按需范本必须完整且未被模板渲染改写。
        expect(await readFile(path.join(projectPath, '.agents/skills/hai-spec-implement', resource), 'utf8'))
          .toBe(await readFile(path.resolve(process.cwd(), 'templates/skills/hai-spec-implement', resource), 'utf8'))
      }
      if (scenario.title === 'api-iam-basic') {
        // 生成项目实际安装和运行基础认证，且没有强制添加可选通知模块或 LDAP SDK。
        const servicePath = path.join(projectPath, 'apps/sample-api-iam-basic-service')
        const manifest: { dependencies?: Record<string, string> } = JSON.parse(await readFile(path.join(servicePath, 'package.json'), 'utf8'))
        expect(manifest.dependencies).not.toHaveProperty('@h-ai/reach')
        expect(manifest.dependencies).not.toHaveProperty('ldapts')
        expect(await fileExists(path.join(servicePath, 'config/_reach.yml'))).toBe(false)
      }
      // 每个成功场景立即释放磁盘资源，清理计入该场景的整体超时预算。
      await removeTempRoot(root)
    }, 1_800_000)
  }
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-cli-scaffold-gates-'))
  tempRoots.add(root)
  return root
}

/** 仅删除本次门禁创建的临时根目录，禁止误删其他路径。 */
async function removeTempRoot(root: string): Promise<void> {
  const target = path.resolve(root)
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('hai-cli-scaffold-gates-'))
    throw new Error('Unexpected scaffold cleanup directory')
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  tempRoots.delete(root)
}

/** 独立移动模板通过真实 API 示例服务验证；进程和数据只属于本次样板门禁。 */
async function startNativeApiService(root: string, baseUrl: string): Promise<() => Promise<void>> {
  const repo = path.resolve(process.cwd(), '../..')
  runPnpm(repo, ['--filter', 'api-service', 'build'])
  const service = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.join(repo, 'apps/api-service'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...authFixtureEnv(),
      HAI_CORE_ENV: 'test',
      HAI_CORE_LOGGING_LEVEL: 'error',
      HAI_SERV_SERVER_PORT: new URL(baseUrl).port,
      HAI_SERV_TRANSPORT: 'false',
      HAI_DB_DATABASE: path.join(root, 'api-data/app.db'),
      HAI_VECDB_PATH: path.join(root, 'api-data/vecdb'),
      HAI_STORAGE_ROOT: path.join(root, 'api-data/uploads'),
      HAI_IAM_REGISTER_ENABLED: 'true',
    },
  })
  let startupError = ''
  service.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    startupError = (startupError + chunk).slice(-4000)
  })
  service.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    startupError = (startupError + chunk).slice(-4000)
  })
  const close = async () => {
    if (service.exitCode !== null)
      return
    await new Promise<void>((resolve) => {
      service.once('exit', () => resolve())
      service.kill()
    })
  }
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (service.exitCode !== null)
        throw new Error(`Native API fixture exited before ready: ${startupError}`)
      const response = await fetch(`${baseUrl}/health`).catch(() => null)
      if (response?.ok)
        return close
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Native API fixture did not become ready')
  }
  catch (error) {
    await close()
    throw error
  }
}

async function allocateBaseUrl(): Promise<string> {
  const port = await getFreePort()
  return `http://127.0.0.1:${port}`
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve free port')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

function runQualityGates(projectPath: string, envOptions: GateEnvOptions = {}): void {
  runPnpm(projectPath, ['install', '--prefer-offline'], envOptions)
  runPnpm(projectPath, ['typecheck'], envOptions)
  if (existsSync(path.join(projectPath, 'tsconfig.capabilities.json')))
    runPnpm(projectPath, ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.capabilities.json'], envOptions)
  runPnpm(projectPath, ['lint'], envOptions)
  // 注入仅属于构建机器的公开值，确认 Vite 和 Kit 都不会将 .env.local 固化进交付包。
  const sentinel = 'hai-build-must-ignore-local-1792584600'
  if (existsSync(path.join(projectPath, 'svelte.config.js')))
    appendFileSync(path.join(projectPath, '.env.local'), `\nPUBLIC_BUILD_ISOLATION_PROBE='${sentinel}'\n`)
  runPnpm(projectPath, ['build'], envOptions)
  for (const output of ['build', 'dist', '.svelte-kit/output']) {
    const directory = path.join(projectPath, output)
    if (!existsSync(directory))
      continue
    for (const file of readdirSync(directory, { recursive: true })) {
      if (/\.(?:js|json|html|css|map)$/.test(String(file)))
        expect(readFileSync(path.join(directory, String(file)), 'utf8'), `Build leaked .env.local into ${output}/${String(file)}`).not.toContain(sentinel)
    }
  }
  runPnpm(projectPath, ['test'], envOptions)
  runPnpm(projectPath, ['test:e2e'], envOptions)
}

function runNode(args: string[]): void {
  runGate(process.execPath, args, process.cwd(), buildChildEnv(), false)
}

function runPnpm(cwd: string, args: string[], envOptions: GateEnvOptions = {}): void {
  const nodeEnv = args[0] === 'build' || args[0] === 'test:e2e' ? 'production' : 'test'
  runGate(pnpmBin, args, cwd, buildChildEnv(envOptions, nodeEnv), true)
}

/**
 * 运行一个门禁命令，捕获输出并在失败时把末尾输出并入错误信息。
 *
 * 用 stdio:'inherit' 时子进程输出只进 CI 原始日志（需鉴权才能读），失败断言只剩
 * `output:[null,null,null]`，无法定位真正的报错。这里捕获 stdout/stderr 后透传显示，
 * 失败时把末尾若干行并入抛出的错误，使其出现在测试报告 / CI check-run annotation 中。
 */
function runGate(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, shell: boolean): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.stdout)
    process.stdout.write(result.stdout)
  if (result.stderr)
    process.stderr.write(result.stderr)
  if (result.error)
    throw result.error
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(-40)
      .join('\n')
    throw new Error(`Command failed: ${command} ${args.join(' ')} (cwd=${cwd}, status=${result.status ?? 'null'})\n--- output tail ---\n${tail}\n--- @h-ai resolution ---\n${describeHaiModules(cwd)}`)
  }
}

/**
 * 报告生成项目中已安装的 @h-ai 包及其类型声明是否存在，用于定位
 * "Cannot find module '@h-ai/xxx' or its corresponding type declarations" 到底是未安装
 * 还是安装了但缺少 .d.ts。hoisted 布局下根 node_modules/@h-ai 包含全部提升包。
 */
function describeHaiModules(cwd: string): string {
  const haiDir = path.join(cwd, 'node_modules', '@h-ai')
  let names: string[]
  try {
    names = readdirSync(haiDir).sort()
  }
  catch {
    return `node_modules/@h-ai not found under ${cwd}`
  }
  return names
    .map((name) => {
      const dts = existsSync(path.join(haiDir, name, 'dist', 'index.d.ts'))
      return `${name}(d.ts=${dts})`
    })
    .join(', ')
}

function buildChildEnv(envOptions: GateEnvOptions = {}, nodeEnv: 'test' | 'production' = 'test'): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...authFixtureEnv(),
    ...(envOptions.baseUrl ? { BASE_URL: envOptions.baseUrl } : {}),
    ...(envOptions.serviceBaseUrl
      ? {
          PUBLIC_API_BASE: envOptions.publicApiBase ?? envOptions.serviceBaseUrl,
          SERVICE_BASE_URL: envOptions.serviceBaseUrl,
        }
      : {}),
    ...Object.fromEntries(Object.entries(envOptions.frontendUrls ?? {}).map(([target, url]) => [`HAI_E2E_${target.toUpperCase()}_URL`, url])),
    CI: '1',
    // 产物按生产模式构建，业务环境独立使用 core 覆盖值，避免继承 Vitest 的开发编译模式。
    NODE_ENV: nodeEnv,
    // 各种脚手架必须消费 core 的覆盖值，避免包名/翻译名称或固定日志级别冒充配置。
    HAI_CORE_NAME: 'Configured scaffold',
    HAI_CORE_VERSION: '9.8.7',
    HAI_CORE_ENV: 'test',
    HAI_CORE_LOGGING_LEVEL: 'warn',
    // 截图使用生成项目自己的 test-results，测试结束后自动清理。
    HAI_AUTH_EVIDENCE_DIR: '',
  }
}

/** 验证真实通知 HTTP 链路；验证码只在内存收件箱中保留。 */
function authFixtureEnv(): NodeJS.ProcessEnv {
  if (!notificationUrl)
    return {}
  return {
    IAM_NOTIFICATION_URL: notificationUrl,
    HAI_IAM_LOGIN_OTP: 'true',
    HAI_IAM_PASSWORDRESET_ENABLED: 'true',
    HAI_REACH_PROVIDERS: JSON.stringify(['email', 'sms'].map(name => ({ name, type: 'api', url: `${notificationUrl}/send` }))),
    HAI_REACH_TEMPLATES: JSON.stringify([
      { name: 'otp_email', provider: 'email', body: 'Code: {code}' },
      { name: 'otp_sms', provider: 'sms', body: 'Code: {code}' },
      { name: 'password_reset', provider: 'email', body: 'Reset: {token}' },
      { name: 'password_reset_sms', provider: 'sms', body: 'Reset: {token}' },
    ]),
    HAI_IAM_AGREEMENTS: JSON.stringify({ showOnRegister: true, showOnLogin: true, userAgreementMarkdown: '# Configured registration agreement\n\n**Registration terms**\n\n- Keep your account credentials secure.', userAgreementUrl: `${notificationUrl}/terms`, privacyPolicyUrl: `${notificationUrl}/privacy` }),
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  }
  catch {
    return false
  }
}

/**
 * 将生成项目中的 Hai 依赖切换到当前工作区 tarball，确保门禁验证的是本地实现。
 */
async function replaceHaiPackageSpecifiers(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await replaceHaiPackageSpecifiers(entryPath)
      continue
    }
    if (entry.name !== 'package.json')
      continue

    const manifest = JSON.parse(await readFile(entryPath, 'utf8')) as Record<string, unknown>
    let changed = false
    for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const section = manifest[sectionName]
      if (!section || typeof section !== 'object' || Array.isArray(section))
        continue

      const dependencies = section as Record<string, unknown>
      for (const [packageName, specifier] of Object.entries(localPackageSpecifiers)) {
        if (!(packageName in dependencies))
          continue
        dependencies[packageName] = specifier
        changed = true
      }
    }

    if (changed)
      await writeFile(entryPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

/** 强制传递依赖也使用本次工作区 tarball，避免混入 registry 中的旧版 @h-ai 包。 */
async function addLocalHaiOverrides(projectPath: string): Promise<void> {
  // pnpm 12 不再读取 package.json.pnpm，且必须保留模板已有的安全版本覆盖。
  const workspacePath = path.join(projectPath, 'pnpm-workspace.yaml')
  const workspace = parse(await readFile(workspacePath, 'utf8')) as Record<string, unknown>
  const overrides = JSON.parse(process.env.HAI_CLI_PACKAGE_OVERRIDES ?? '{}') as Record<string, string>
  workspace.overrides = { ...(workspace.overrides as Record<string, unknown> | undefined), ...overrides }
  await writeFile(workspacePath, stringify(workspace))
}

/**
 * 本地依赖已改用 file: 后删除测试副本中对应 catalog 项，避免 unused-catalog lint 误报。
 */
async function removeReplacedHaiCatalogEntries(projectPath: string): Promise<void> {
  const workspacePath = path.join(projectPath, 'pnpm-workspace.yaml')
  const workspace: unknown = parse(await readFile(workspacePath, 'utf8'))
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace))
    throw new TypeError('Generated pnpm-workspace.yaml must contain an object')

  const catalog = (workspace as Record<string, unknown>).catalog
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog))
    return

  for (const packageName of Object.keys(localPackageSpecifiers))
    delete (catalog as Record<string, unknown>)[packageName]

  await writeFile(workspacePath, stringify(workspace))
}

function parseLocalPackageSpecifiers(raw: string | undefined): Readonly<Record<string, string>> {
  if (!raw)
    return {}

  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('HAI_CLI_PACKAGE_SPECIFIERS must be a package-to-specifier object')

  const entries = Object.entries(parsed)
  if (entries.some(([packageName, specifier]) => !packageName.startsWith('@h-ai/') || typeof specifier !== 'string' || specifier.length === 0))
    throw new TypeError('HAI_CLI_PACKAGE_SPECIFIERS contains an invalid package specifier')

  return Object.fromEntries(entries) as Record<string, string>
}
