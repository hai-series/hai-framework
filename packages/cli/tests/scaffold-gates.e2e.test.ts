/**
 * 真实样板门禁 E2E。
 *
 * 默认跳过，避免常规单测安装依赖与启动浏览器过慢。
 * 显式运行：pnpm --filter @h-ai/cli test:scaffold-gates
 */

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { createE2eServerEnv, createE2eTransportRing } from '../../../scripts/e2e-env.js'
import { withDatabaseIsolation } from './fixtures/e2e-db-isolation.js'

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
  expectedBuildCommit?: string
}

const scaffoldGateCases: readonly ScaffoldGateCase[] = [
  {
    title: 'api-feedback',
    projectName: 'sample-api-feedback',
    createArgs: ['--type', 'api', '--template', 'custom', '--features', 'feedback', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['apps/sample-api-feedback-serv/config/_feedback.yml', 'e2e/api-serv.spec.ts'],
  },
  {
    title: 'fullstack-feedback',
    projectName: 'sample-fullstack-feedback',
    createArgs: ['--type', 'fullstack', '--frontends', 'web', '--features', 'feedback', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm'],
    expectedFiles: ['packages/sample-fullstack-feedback-shared/src/lib/pages/feedback.svelte', 'packages/sample-fullstack-feedback-serv/config/_feedback.yml'],
  },
  {
    title: 'api-transport',
    projectName: 'sample-api-transport',
    createArgs: ['--type', 'api', '--template', 'custom', '--features', 'crypto,db', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['apps/sample-api-transport-serv/config/_serv.yml', 'e2e/api-serv.spec.ts'],
  },
  {
    title: 'api',
    projectName: 'sample-api',
    createArgs: ['--type', 'api', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-serv.spec.ts', 'apps/sample-api-serv/package.json'],
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
    expectedFiles: ['e2e/api-serv.spec.ts', 'apps/sample-api-iam-serv/config/_iam.yml'],
  },
  {
    title: 'api-iam-basic',
    projectName: 'sample-api-iam-basic',
    createArgs: ['--type', 'api', '--template', 'custom', '--features', 'iam,db,cache', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-serv.spec.ts', 'apps/sample-api-iam-basic-serv/config/_iam.yml'],
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
  it('static website gates pass local package install, quality checks and Pages browser flow', async () => {
    expect(Object.keys(localPackageSpecifiers).length, 'Static acceptance must use the current local tarballs').toBeGreaterThan(0)
    const root = await createTempRoot()
    const projectPath = path.join(root, 'sample-static-website')
    const basePath = '/scaffold-static'
    const baseUrl = `${await allocateBaseUrl()}${basePath}/`
    runNode([cliBin, '--cwd', root, 'create', 'sample-static-website', '--type', 'website', '--features', 'none', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'])
    await replaceHaiPackageSpecifiers(projectPath)
    await addLocalHaiOverrides(projectPath)
    await removeReplacedHaiCatalogEntries(projectPath)
    const manifest = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    for (const name of ['reldb', 'cache', 'iam', 'feedback'])
      expect(manifest.dependencies).not.toHaveProperty(`@h-ai/${name}`)
    expect(manifest.dependencies).toHaveProperty('@h-ai/core')
    expect(manifest.dependencies).toHaveProperty('@h-ai/ui')
    // 使用真实生成工程、真实安装和完整配置检查，不以模板字符串断言替代。
    await runPnpm(projectPath, ['install', '--prefer-offline'])
    await runPnpm(projectPath, ['typecheck'])
    await runPnpm(projectPath, ['lint'])
    const sentinel = 'static-private-env-must-not-be-published-1793205000'
    appendFileSync(path.join(projectPath, '.env.local'), `\nPUBLIC_BUILD_ISOLATION_PROBE='${sentinel}'\nHAI_PRIVATE_TOKEN='${sentinel}'\n`)
    await writeFile(path.join(projectPath, 'static/public-probe.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><title>Public static asset</title></svg>\n')
    runGate(pnpmBin, ['build'], projectPath, { ...buildChildEnv({}, 'production'), HAI_BUILD_STATIC: '1', PUBLIC_BASE_PATH: basePath }, true)
    const output = path.join(projectPath, 'build')
    for (const file of ['index.html', 'about/index.html', 'services/index.html', 'contact/index.html', '.nojekyll', 'favicon.png', 'public-probe.svg'])
      expect(await fileExists(path.join(output, file)), `Static output missing ${file}`).toBe(true)
    for (const file of ['api', 'index.js', 'handler.js'])
      expect(await fileExists(path.join(output, file)), `Static output contains a dynamic entry: ${file}`).toBe(false)
    let checked = 0
    for (const file of readdirSync(output, { recursive: true })) {
      if (/\.(?:js|json|html|css|map)$/.test(String(file))) {
        checked++
        expect(readFileSync(path.join(output, String(file)), 'utf8'), `Static output leaked .env.local: ${String(file)}`).not.toContain(sentinel)
      }
    }
    expect(checked).toBeGreaterThan(0)
    // 仅为临时生成工程提供纯静态服务器；没有Node宿主、API或SPA回退。
    await writeFile(path.join(projectPath, 'scripts/static-gate-server.mjs'), `import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
const root = path.resolve('build')
const base = ${JSON.stringify(basePath)}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  if (!pathname.startsWith(base + '/')) return response.writeHead(404).end()
  let file = path.resolve(root, '.' + pathname.slice(base.length))
  if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end()
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file))
  }
  catch { response.writeHead(404).end() }
})
server.listen(${Number(new URL(baseUrl).port)}, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close())
`)
    await writeFile(path.join(projectPath, 'playwright.static.config.ts'), `import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'static-website.spec.ts', workers: 1, retries: 0, timeout: 45000,
  use: { baseURL: ${JSON.stringify(baseUrl)}, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/static-gate-server.mjs', url: ${JSON.stringify(baseUrl)}, reuseExistingServer: false },
})
`)
    await writeFile(path.join(projectPath, 'e2e/static-website.spec.ts'), `import { expect, test } from '@playwright/test'
test('static Pages deep links, public assets and honest contact feedback', async ({ page, request }, testInfo) => {
  const errors: string[] = []
  const failed: string[] = []
  const posts: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()) })
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()) })
  for (const route of ['', 'about/', 'services/', 'contact/']) {
    const response = await page.goto(${JSON.stringify(baseUrl)} + route)
    expect(response?.status()).toBe(200)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    expect((await page.reload())?.status()).toBe(200)
    await expect(page).toHaveURL(${JSON.stringify(baseUrl)} + route)
  }
  const home = await (await request.get(${JSON.stringify(baseUrl)})).text()
  const assets = [...home.matchAll(/["']([^"']+\\.(?:js|css|png))["']/g)].map(match => match[1])
  expect(assets.some(value => value.endsWith('.js'))).toBe(true)
  expect(assets.some(value => value.endsWith('.css'))).toBe(true)
  for (const asset of assets) {
    const resolved = new URL(asset, ${JSON.stringify(baseUrl)})
    expect(resolved.origin).toBe(new URL(${JSON.stringify(baseUrl)}).origin)
    expect(resolved.pathname.startsWith(${JSON.stringify(`${basePath}/`)})).toBe(true)
    expect((await request.get(resolved.href)).status(), asset).toBe(200)
  }
  expect(await (await request.get(${JSON.stringify(`${baseUrl}public-probe.svg`)})).text()).toContain('Public static asset')
  for (const route of ['api/health', 'api/not-present', 'not-a-page/'])
    expect((await request.get(${JSON.stringify(baseUrl)} + route)).status()).toBe(404)
  await page.locator('#name').fill('Static visitor')
  await page.locator('#email').fill('visitor@example.invalid')
  await page.locator('#message').fill('Contact input should remain available.')
  await page.getByRole('button', { name: /发送|Send|送信/, exact: true }).click()
  await expect(page.locator('.hai-toast-item[data-variant=warning]').filter({ hasText: /在线留言尚未开通|Online messages are not available yet|オンラインメッセージは未対応/ })).toBeVisible()
  await expect(page.locator('#name')).toHaveValue('Static visitor')
  await expect(page.locator('#email')).toHaveValue('visitor@example.invalid')
  await expect(page.locator('#message')).toHaveValue('Contact input should remain available.')
  await page.screenshot({ path: testInfo.outputPath('static-website-contact-warning.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('static-website-mobile.png'), fullPage: true })
  expect(posts).toEqual([])
  expect(errors).toEqual([])
  expect(failed).toEqual([])
})
`)
    await runPnpm(projectPath, ['test:e2e', '--config', 'playwright.static.config.ts'], { baseUrl })
    await removeTempRoot(root)
  }, 1_800_000)

  for (const scenario of scaffoldGateCases) {
    it(`${scenario.title} scaffold passes install, typecheck, lint, build, unit and e2e`, async () => {
      const root = await createTempRoot()
      const projectPath = path.join(root, scenario.projectName)
      const baseUrl = await allocateBaseUrl()
      const envOptions: GateEnvOptions = { baseUrl }

      if (scenario.title.startsWith('fullstack')) {
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
      if (scenario.title.startsWith('fullstack') || scenario.title === 'mobile-app') {
        const pageRoot = scenario.title.startsWith('fullstack')
          ? `packages/${scenario.projectName}-shared/src/lib/pages`
          : 'src/lib/pages'
        // 生成后只新增页面文件，禁止修改路由器或菜单，验证页面目录自动发现。
        await writeFile(path.join(projectPath, pageRoot, 'auto-discovered.svelte'), '<section data-testid=\'route-probe\'>Scaffold discovered page</section>\n')
        const discovery = await readFile(path.resolve(process.cwd(), 'tests/fixtures/hash-discovery.ts'), 'utf8')
        await writeFile(path.join(projectPath, 'e2e/hash-discovery.spec.ts'), discovery.replaceAll('SCAFFOLD_HASH_APP_TYPE', scenario.title.startsWith('fullstack') ? 'fullstack' : scenario.title))
      }
      if (scenario.title === 'admin' || scenario.title.startsWith('fullstack')) {
        // 验证实际安装的 tarball 公共类型与运行行为，不能只靠框架源码别名。
        const moduleRoot = scenario.title.startsWith('fullstack') ? `packages/${scenario.projectName}-serv` : '.'
        const testsRoot = path.join(projectPath, moduleRoot, 'tests')
        const fixtures = path.resolve(process.cwd(), 'tests/fixtures')
        await writeFile(path.join(testsRoot, 'public-capabilities.test.ts'), await readFile(path.join(fixtures, 'public-capabilities.ts')))
        const include = [`${moduleRoot}/tests/public-capabilities.test.ts`]
        if (scenario.title.startsWith('fullstack')) {
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
      if (scenario.title === 'fullstack-feedback') {
        // 前后端与 core 展示版本故意不同；提交仅属于本轮临时生成工程。
        for (const [target, version] of [['apps/sample-fullstack-feedback-web', '2.4.6-frontend'], ['packages/sample-fullstack-feedback-serv', '7.8.9-serv']]) {
          const manifestPath = path.join(projectPath, target, 'package.json')
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
          await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
        }
        runGate('git', ['init', '--quiet'], projectPath, process.env, false)
        runGate('git', ['add', '--all'], projectPath, process.env, false)
        runGate('git', ['-c', 'core.hooksPath=.git/empty-hooks', '-c', 'user.name=Scaffold metadata', '-c', 'user.email=scaffold@example.invalid', 'commit', '--quiet', '-m', 'metadata acceptance fixture'], projectPath, process.env, false)
        const committed = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectPath, encoding: 'utf8', windowsHide: true })
        if (committed.status !== 0 || !/^[a-f\d]{40,64}$/i.test(committed.stdout.trim()))
          throw new Error('The metadata fixture must have its own exact Git commit')
        envOptions.expectedBuildCommit = committed.stdout.trim()
      }
      if (scenario.title === 'mobile-app') {
        envOptions.serviceBaseUrl = await allocateBaseUrl()
        envOptions.publicApiBase = `${envOptions.serviceBaseUrl}/api/v1`
        const closeService = await startNativeApiService(root, envOptions.serviceBaseUrl)
        try {
          await runQualityGates(projectPath, envOptions)
        }
        finally { await closeService() }
      }
      else {
        await runQualityGates(projectPath, envOptions)
      }

      if (scenario.title === 'admin' || scenario.title === 'fullstack-feedback')
        await runPrefixBrowserGates(projectPath, scenario.title === 'admin' ? 'sveltekit' : 'vite', envOptions)

      if (scenario.title === 'fullstack' && process.env.HAI_CLI_NATIVE_BUILD === '1') {
        if (process.platform !== 'win32')
          throw new Error('This installer acceptance case requires a Windows runner')
        // 根版本故意不同于桌面子包，验证 CLI 与 Tauri 产物确实跟随应用根版本。
        const applicationManifest = path.join(projectPath, 'package.json')
        const metadata = JSON.parse(await readFile(applicationManifest, 'utf8'))
        await writeFile(applicationManifest, `${JSON.stringify({ ...metadata, version: '2.4.6' }, null, 2)}\n`)
        await runPnpm(projectPath, ['build', '--target', 'desktop', '--platform', 'windows', '--arch', 'x64'])
        const installers = await readdir(path.join(projectPath, 'apps/sample-fullstack-desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis'))
        expect(installers.some(file => file.includes('_2.4.6_') && file.endsWith('-setup.exe'))).toBe(true)
      }

      for (const relativePath of scenario.expectedFiles) {
        expect(await fileExists(path.join(projectPath, relativePath))).toBe(true)
      }
      for (const resource of ['SKILL.md', 'workflow.md', 'templates.md', 'changes.md', 'handoff.md', 'evaluation.md']) {
        // 从实际 CLI 构建生成，工作流入口及其按需范本必须完整且未被模板渲染改写。
        expect(await readFile(path.join(projectPath, '.agents/skills/hai-spec-implement', resource), 'utf8'))
          .toBe(await readFile(path.resolve(process.cwd(), 'templates/skills/hai-spec-implement', resource), 'utf8'))
      }
      if (scenario.title.startsWith('fullstack')) {
        for (const [skill, resource] of [['hai-ui-design', 'patterns.md'], ['hai-ui-review', 'checklist.md']]) {
          expect(await readFile(path.join(projectPath, '.agents/skills', skill, resource), 'utf8'))
            .toBe(await readFile(path.resolve(process.cwd(), 'templates/skills', skill, resource), 'utf8'))
        }
      }
      if (scenario.title === 'api-iam-basic') {
        // 生成项目实际安装和运行基础认证，且没有强制添加可选通知模块或 LDAP SDK。
        const servicePath = path.join(projectPath, 'apps/sample-api-iam-basic-serv')
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
  await runPnpm(repo, ['--filter', 'api-service', 'build'])
  const service = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.join(repo, 'apps/api-service'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...createE2eServerEnv({
        ...authFixtureEnv(),
        HAI_E2E_DATA_ROOT: path.join(root, 'api-data'),
        HAI_CORE_ENV: 'test',
        HAI_CORE_LOGGING_LEVEL: 'error',
        HAI_SERV_SERVER_PORT: new URL(baseUrl).port,
        HAI_DB: JSON.stringify({ type: 'sqlite', database: path.join(root, 'api-data/app.db') }),
        HAI_CACHE: JSON.stringify({ type: 'memory' }),
        HAI_VECDB: JSON.stringify({ type: 'lancedb', path: path.join(root, 'api-data/vecdb') }),
        HAI_STORAGE: JSON.stringify({ type: 'local', root: path.join(root, 'api-data/uploads') }),
        HAI_CRYPTO_TRANSPORT_SERVERKEYRING: createE2eTransportRing(),
        HAI_IAM_REGISTER_ENABLED: 'true',
      }),
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

/** 复用本轮安装与构建，额外验收真实生成工程的目录挂载和认证边界。 */
async function runPrefixBrowserGates(projectPath: string, kind: 'sveltekit' | 'vite', envOptions: GateEnvOptions): Promise<void> {
  const fixtures = path.resolve(process.cwd(), 'tests/fixtures')
  const spec = (await readFile(path.join(fixtures, 'prefix-browser.ts'), 'utf8')).replace('SCAFFOLD_KIND', kind)
  await writeFile(path.join(projectPath, 'e2e/prefix-browser.spec.ts'), spec)
  const proxyUrl = kind === 'vite' ? await allocateBaseUrl() : undefined
  const rootUrl = envOptions.baseUrl!
  const prefixUrl = `${proxyUrl ?? rootUrl}/yyy/`
  if (kind === 'sveltekit') {
    const route = path.join(projectPath, 'src/routes/api/prefix-probe')
    await mkdir(route, { recursive: true })
    await writeFile(path.join(route, '+server.ts'), `/** 专用于验证全局认证守卫，处理器自身不重复实现认证。 */\nexport const GET = () => Response.json({ success: true, data: { private: true } })\n`)
  }
  else {
    await writeFile(path.join(projectPath, 'scripts/prefix-proxy.mjs'), await readFile(path.join(fixtures, 'prefix-proxy.mjs')))
  }
  const config = `import { defineConfig } from '@playwright/test'
import original from './playwright.config'

const servers = Array.isArray(original.webServer) ? original.webServer : [original.webServer!]
export default defineConfig({
  ...original,
  workers: 1,
  fullyParallel: false,
  testMatch: ${JSON.stringify(kind === 'vite' ? ['fullstack.spec.ts', 'prefix-browser.spec.ts'] : ['prefix-browser.spec.ts'])},
  use: { ...original.use, baseURL: ${JSON.stringify(prefixUrl)} },
  webServer: ${kind === 'sveltekit'
    ? `servers.map(server => ({ ...server, env: { ...server.env, PUBLIC_BASE_PATH: '/yyy' }, url: ${JSON.stringify(prefixUrl)} }))`
    : `[...servers.map(server => server.name?.endsWith('-web') ? {
      ...server,
      command: ${JSON.stringify(`pnpm --filter ${path.basename(projectPath)}-web exec vite preview --host 127.0.0.1 --port ${new URL(rootUrl).port} --strictPort`)},
      url: ${JSON.stringify(rootUrl)},
    } : server), {
      command: 'node scripts/prefix-proxy.mjs',
      env: { PREFIX_WEB_URL: ${JSON.stringify(rootUrl)}, PREFIX_SERVICE_URL: ${JSON.stringify(envOptions.serviceBaseUrl)}, PREFIX_PROXY_URL: ${JSON.stringify(proxyUrl)} },
      url: ${JSON.stringify(`${proxyUrl}/health`)},
      reuseExistingServer: false,
    }]`},
})
`
  await writeFile(path.join(projectPath, 'playwright.prefix.config.ts'), config)
  // 测试夹具使用JSON编码安全嵌入地址；统一为项目风格后，再执行完整lint。
  await runPnpm(projectPath, ['exec', 'eslint', 'playwright.prefix.config.ts', '--fix'], envOptions)
  await runPnpm(projectPath, ['lint'], envOptions)
  await runPnpm(projectPath, ['exec', 'node', 'scripts/run-e2e.mjs', '--config', 'playwright.prefix.config.ts'], { ...envOptions, baseUrl: prefixUrl, ...(kind === 'vite' ? { frontendUrls: { ...envOptions.frontendUrls, web: prefixUrl } } : {}) })
}

async function runQualityGates(projectPath: string, envOptions: GateEnvOptions = {}): Promise<void> {
  await runPnpm(projectPath, ['install', '--prefer-offline'], envOptions)
  await runPnpm(projectPath, ['typecheck'], envOptions)
  if (existsSync(path.join(projectPath, 'tsconfig.capabilities.json')))
    await runPnpm(projectPath, ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.capabilities.json'], envOptions)
  await runPnpm(projectPath, ['lint'], envOptions)
  // 注入仅属于构建机器的公开值，确认 Vite 和 Kit 都不会将 .env.local 固化进交付包。
  const sentinel = 'hai-build-must-ignore-local-1792584600'
  const checksBuildIsolation = existsSync(path.join(projectPath, 'svelte.config.js'))
  if (checksBuildIsolation)
    appendFileSync(path.join(projectPath, '.env.local'), `\nPUBLIC_BUILD_ISOLATION_PROBE='${sentinel}'\n`)
  await runPnpm(projectPath, ['test'], envOptions)
  // 各模板的 E2E 入口或 webServer 自带完整构建，保留一次真实编译和浏览器验收。
  await runPnpm(projectPath, ['test:e2e'], envOptions)
  if (!checksBuildIsolation)
    return
  let checkedFiles = 0
  for (const output of ['build', 'dist', '.svelte-kit/output']) {
    const directory = path.join(projectPath, output)
    if (!existsSync(directory))
      continue
    for (const file of readdirSync(directory, { recursive: true })) {
      if (/\.(?:js|json|html|css|map)$/.test(String(file))) {
        checkedFiles++
        expect(readFileSync(path.join(directory, String(file)), 'utf8'), `Build leaked .env.local into ${output}/${String(file)}`).not.toContain(sentinel)
      }
    }
  }
  expect(checkedFiles, 'Build isolation requires actual generated output files').toBeGreaterThan(0)
}

function runNode(args: string[]): void {
  runGate(process.execPath, args, process.cwd(), buildChildEnv(), false)
}

/**
 * 运行生成工程的 pnpm 命令；浏览器证据写到工程外，临时工程仍由上层回收。
 * @param cwd - 本轮生成工程的绝对路径。
 * @param args - pnpm 子命令及独立参数。
 * @param envOptions - 本轮 loopback 服务与前端地址。
 * @returns 命令和隔离计数进程均完成后返回。
 * @throws 子命令执行或证据目录创建失败时抛错。
 * @example
 * ```ts
 * await runPnpm(projectPath, ['test:e2e'])
 * ```
 */
async function runPnpm(cwd: string, args: string[], envOptions: GateEnvOptions = {}): Promise<void> {
  const isBrowser = args[0] === 'test:e2e' || (args[0] === 'exec' && args[1] === 'node' && args[2] === 'scripts/run-e2e.mjs')
  const nodeEnv = args[0] === 'build' || isBrowser ? 'production' : 'test'
  const env = buildChildEnv(envOptions, nodeEnv)
  if (isBrowser) {
    // 只持久保留浏览器产物，临时工程及私有环境仍由 removeTempRoot 回收。
    const parent = path.resolve(process.env.HAI_AUTH_EVIDENCE_DIR || path.join(process.cwd(), '../../tmp/validation/module-review/scaffold-browser'))
    mkdirSync(parent, { recursive: true })
    env.HAI_AUTH_EVIDENCE_DIR = mkdtempSync(path.join(parent, `${path.basename(cwd)}-`))
    const owner = [...tempRoots].find((root) => {
      const relative = path.relative(root, cwd)
      return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
    })
    if (!owner)
      throw new Error('Database isolation requires an owned scaffold project')
    await withDatabaseIsolation(cwd, env.HAI_AUTH_EVIDENCE_DIR, env, () => runGate(pnpmBin, args, cwd, env, true))
    return
  }
  runGate(pnpmBin, args, cwd, env, true)
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
    ...(envOptions.expectedBuildCommit ? { E2E_BUILD_COMMIT: envOptions.expectedBuildCommit } : {}),
    CI: '1',
    // 产物按生产模式构建，业务环境独立使用 core 覆盖值，避免继承 Vitest 的开发编译模式。
    NODE_ENV: nodeEnv,
    // 各种脚手架必须消费 core 的覆盖值，避免包名/翻译名称或固定日志级别冒充配置。
    HAI_CORE_NAME: 'Configured scaffold',
    HAI_CORE_VERSION: '9.8.7',
    HAI_CORE_ENV: 'test',
    HAI_CORE_LOGGING_LEVEL: 'warn',
    // 浏览器执行时由 runPnpm 分配独立证据目录，不覆盖调用方的证据根目录。
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
