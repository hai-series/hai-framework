/** 直接运行应用已有 dev 脚本；不注入环境变量、生成凭据或改写环境文件。 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnOwned, stopOwned } from './startup-process.mjs'

/** 仅列出真实 workspace 包，供原生客户端启动其公开 API 示例命令。 */
function packages(directory) {
  const result = [directory]
  for (const parent of ['apps', 'packages']) {
    const root = join(directory, parent)
    if (existsSync(root))
      result.push(...readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => join(root, item.name)))
  }
  return result.filter(item => existsSync(join(item, 'package.json'))).map(directory => ({
    directory,
    manifest: JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')),
  }))
}

/** 只读当前开发配置；所有优先级和密钥校验仍由真实应用完成。 */
async function settings(directory) {
  const require = createRequire(join(directory, 'package.json'))
  let entry
  try {
    entry = require.resolve('@h-ai/core')
  }
  catch { return { urls: [], secrets: [] } }
  const { core } = await import(pathToFileURL(entry).href)
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const envArgument = /run-node\.mjs\s+dev\s+(\S+)/.exec(manifest.scripts?.dev ?? '')?.[1]
  const loaded = core.config.loadEnvFiles({
    mode: 'dev',
    envDir: envArgument
      ? resolve(directory, envArgument)
      : directory,
  })
  if (!loaded.success)
    throw new Error('The actual development environment could not be read')
  // 环境变量的 camelCase 字段不拆词；只补充凭证尾名，保留密码策略等数字配置的可读性。
  const secrets = Object.entries(loaded.data).filter(([name]) => core.sanitize.isSensitiveKey(name) || /(?:PASSWORD|SECRET|TOKEN|PRIVATEKEY|SERVERKEYRING|APIKEY|ACCESSKEY)$/i.test(name)).map(([, value]) => value)
  try {
    for (const pair of Object.values(JSON.parse(loaded.data.HAI_CRYPTO_TRANSPORT_SERVERKEYRING).keys))
      secrets.push(pair.privateKey)
  }
  catch { /* 无密钥或无效密钥交给应用原样拒绝；诊断不输出原值。 */ }
  const urls = []
  const file = join(directory, 'config/_serv.yml')
  if (existsSync(file)) {
    const { parse } = createRequire(entry)('yaml')
    const configured = core.config.resolve({
      name: 'serv',
      value: parse(readFileSync(file, 'utf8')),
      environment: loaded.data,
    })
    if (!configured.success)
      throw new Error('The actual service configuration could not be read')
    const config = configured.data
    if (config) {
      const host = config.server?.host === '::'
        ? '[::1]'
        : config.server?.host === 'localhost'
          ? 'localhost'
          : '127.0.0.1'
      const origin = `http://${host}:${config.server?.port ?? 3000}`
      if (config.http?.health !== false) {
        urls.push(new URL(config.http?.health?.path ?? '/health', origin).href)
        urls.push(new URL(config.http?.health?.readyPath ?? '/ready', origin).href)
      }
    }
  }
  return {
    core,
    urls,
    secrets,
    apiBase: loaded.data.PUBLIC_API_BASE,
  }
}

/** 浏览器只做启动冒烟；业务行为由应用自己的 Playwright 测试验证。 */
async function browserReady(urls) {
  let browser
  const require = createRequire(import.meta.url)
  const imported = await import(pathToFileURL(require.resolve('@playwright/test')).href)
  try {
    browser = await (imported.default ?? imported).chromium.launch({ channel: 'chrome' })
    for (const url of urls) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', () => errors.push('pageerror'))
      page.on('response', (response) => {
        if (response.status() >= 500 || (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(response.request().resourceType())))
          errors.push(`HTTP ${response.status()}`)
      })
      page.on('requestfailed', (request) => {
        if (['document', 'script', 'stylesheet'].includes(request.resourceType()))
          errors.push('resource failed')
      })
      const response = await page.goto(url, { waitUntil: 'load' })
      if (!response?.ok())
        throw new Error('The actual development page returned an unsuccessful response')
      await page.waitForFunction(() => Boolean(document.body?.textContent?.trim()) && !document.querySelector('vite-error-overlay'), { timeout: 60_000 })
      if (errors.length)
        throw new Error(`The actual development page failed browser startup: ${errors.join(', ')}`)
      await page.close()
    }
  }
  finally {
    if (browser)
      await browser.close()
  }
}

/**
 * 直接执行真实 pnpm run dev，仅读取就绪页面，不修改或清理业务数据。
 * @param {string} cwd 应用目录；生成工程已经由调用方放在独立临时目录。
 * @param {{ evidence: string, signal?: AbortSignal, timeoutMs?: number }} options 证据与取消。
 * @returns {Promise<void>} 启动和退出均验证完成后返回。
 */
export async function runDefaultDev(cwd, options) {
  cwd = resolve(cwd)
  mkdirSync(options.evidence, { recursive: true })
  const report = {
    command: 'pnpm run dev',
    cwd,
    applicationEnvironmentOverrides: [],
    startupArguments: ['run', 'dev'],
    ready: false,
    processCleanupConfirmed: true,
  }
  writeFileSync(join(options.evidence, 'startup.json'), JSON.stringify(report, null, 2))
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  if (!manifest.scripts?.dev)
    throw new Error('Package has no dev script')
  let root = cwd
  while (!existsSync(join(root, 'pnpm-workspace.yaml')) && dirname(root) !== root)
    root = dirname(root)
  const installed = packages(existsSync(join(root, 'pnpm-workspace.yaml'))
    ? root
    : cwd)
  const names = [
    ...manifest.scripts.dev.matchAll(/--filter\s+(\S+)/g),
  ].map(match => match[1])
  const selected = installed.filter(item => names.includes(item.manifest.name))
  const companion = manifest.dependencies?.['@h-ai/api-service-contract']
    ? installed.find(item => item.manifest.name === 'api-service')
    : undefined
  if (companion)
    selected.push(companion)
  const configurations = await Promise.all([
    ...new Set([
      cwd,
      ...selected.map(item => item.directory),
    ]),
  ].map(settings))
  const urls = [
    ...new Set(configurations.flatMap(item => item.urls)),
  ]
  for (const item of configurations) {
    if (item.apiBase && /^https?:\/\//.test(item.apiBase)) {
      const api = new URL(item.apiBase)
      urls.push(new URL('/health', api.origin).href)
    }
  }
  // 不探测或复用其他进程的健康响应；固定服务端口被占用时直接报告前置失败。
  for (const origin of new Set(configurations.flatMap(item => item.urls).map(value => new URL(value).origin))) {
    const url = new URL(origin)
    await new Promise((resolve, reject) => {
      const socket = createConnection({
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: Number(url.port),
      })
      socket.once('connect', () => {
        socket.destroy()
        reject(new Error('The configured development service port is already in use'))
      })
      socket.once('error', error => error.code === 'ECONNREFUSED'
        ? resolve()
        : reject(error))
    })
  }
  const frontendCount = /\bvite\b/.test(manifest.scripts.dev)
    ? 1
    : selected.filter(item => /\bvite\b/.test(item.manifest.scripts?.dev ?? '')).length
  const pnpm = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'npm_execpath')?.[1]
  if (!pnpm)
    throw new Error('Run the startup check through pnpm')
  const children = []
  let output = ''
  const pages = new Set()
  const announced = new Set()
  const start = (directory) => {
    const args = ['run', 'dev']
    const child = spawnOwned(/\.(?:c|m)?js$/i.test(pnpm)
      ? process.execPath
      : pnpm, /\.(?:c|m)?js$/i.test(pnpm)
      ? [pnpm, ...args]
      : args, {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const capture = (chunk) => {
      // eslint-disable-next-line no-control-regex -- 仅移除终端颜色后读取本轮进程自行公布的 URL。
      output = (output + String(chunk).replace(/\x1B\[[0-9;]*m/g, '')).slice(-512 * 1024)
      for (const match of output.matchAll(/Local:\s+(http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d\S*)/g)) {
        announced.add(match[1])
        if (frontendCount)
          pages.add(match[1])
      }
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    children.push(child)
  }
  let failure
  let cleanupFailed = false
  report.processCleanupConfirmed = false
  const stop = () => {
    for (const child of children)
      void stopOwned(child).catch((error) => { failure = error })
  }
  options.signal?.addEventListener('abort', stop, { once: true })
  try {
    if (companion)
      start(companion.directory)
    start(cwd)
    const deadline = Date.now() + (options.timeoutMs ?? 240_000)
    while (true) {
      if (options.signal?.aborted)
        throw new Error('Default dev startup was interrupted')
      if (failure)
        throw failure
      if (children.some(child => child.exitCode !== null || child.signalCode !== null))
        throw new Error('Default dev exited before readiness')
      if (Date.now() >= deadline)
        throw new Error('Actual dev startup did not complete before the deadline')
      const targets = [
        ...new Set([
          ...urls,
          ...announced,
        ]),
      ]
      if (pages.size >= frontendCount && targets.length) {
        const responses = await Promise.all(targets.map(url => fetch(url, {
          signal: AbortSignal.timeout(5_000),
        }).catch(() => undefined)))
        if (responses.some(response => response?.status === 500))
          throw new Error('Default dev returned HTTP 500 during application initialization')
        if (responses.every(response => response?.ok))
          break
      }
      await delay(250)
    }
    if (pages.size)
      await browserReady(pages)
    if (options.signal?.aborted)
      throw new Error('Default dev startup was interrupted')
    if (children.some(child => child.exitCode !== null || child.signalCode !== null))
      throw new Error('Default dev exited before readiness')
    report.ready = true
    report.endpoints = [
      ...new Set([
        ...urls,
        ...announced,
      ]),
    ]
  }
  catch (error) { failure = error }
  finally {
    options.signal?.removeEventListener('abort', stop)
    for (const child of children) {
      try {
        await stopOwned(child)
      }
      catch (error) {
        failure = error
        cleanupFailed = true
      }
    }
    report.processCleanupConfirmed = !cleanupFailed
    if (failure)
      report.ready = false
    const core = configurations.find(item => item.core)?.core
    writeFileSync(join(options.evidence, 'startup.log'), core
      ? core.sanitize.sanitizeText(output, configurations.flatMap(item => item.secrets))
      : 'Application output withheld: no public Core sanitizer was available.\n')
    if (failure) {
      report.message = core
        ? core.sanitize.sanitizeText(failure.message)
        : 'Actual development startup failed'
    }
    writeFileSync(join(options.evidence, 'startup.json'), JSON.stringify(report, null, 2))
  }
  if (failure)
    throw failure
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length % 2 || args.some((value, index) => index % 2 === 0 && value !== '--cwd'))
    throw new Error('Usage: pnpm exec node startup-baseline.mjs --cwd <application>')
  const targets = args.length
    ? args.filter((_, index) => index % 2)
    : existsSync(join(process.cwd(), 'apps/admin-console/package.json'))
      ? packages(process.cwd()).filter(item => (item.manifest.scripts?.start || item.manifest.scripts?.preview) && item.directory.startsWith(join(process.cwd(), 'apps') + (process.platform === 'win32'
          ? '\\'
          : '/'))).map(item => item.directory)
      : [
          process.cwd(),
        ]
  for (const cwd of targets) {
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      await runDefaultDev(cwd, {
        evidence: join(resolve(cwd), 'test-results/startup'),
        signal: controller.signal,
      })
    }
    catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
    finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
    if (controller.signal.aborted)
      break
  }
}
