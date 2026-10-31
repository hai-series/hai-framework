/** 打包下载设置：项目保存选源，代理按本机环境解析。 */
import type { DownloadProxyConfig, ImageSourceConfig } from '@h-ai/deploy'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import process from 'node:process'
import { resolveDownloadProxy, resolveImageReference } from '@h-ai/deploy'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'
import { projectConfigPath, readProjectConfig } from './cli-project-config.js'

/**
 * CLI 内部下载参数；构建与部署入口共同消费。
 * @example 模块内部上下文
 * ```ts
 * const options: BuildDownloadOptions = { imageSource: 'cn', npmSource: 'cn', proxyMode: 'inherit', yes: true }
 * ```
 */
export interface BuildDownloadOptions {
  imageSource?: 'official' | 'cn' | 'custom'
  imageMirrors?: string
  npmSource?: 'official' | 'cn' | 'custom'
  npmRegistry?: string
  proxyMode?: DownloadProxyConfig['mode']
  proxyUrl?: string
  proxyBypass?: string
  httpProxy?: boolean
  yes?: boolean
}

/**
 * 已解析的本次下载设置，不包含运行时应用配置。
 * @example 模块内部上下文
 * ```ts
 * const downloads: BuildDownloads = { imageSource: { type: 'cn' }, npmSource: { type: 'cn' }, npmRegistry: 'https://registry.npmmirror.com', proxy: { mode: 'inherit' } }
 * ```
 */
export interface BuildDownloads {
  imageSource: ImageSourceConfig
  npmRegistry: string
  npmSource: { type: 'official' | 'cn' | 'custom', registry?: string }
  proxy: DownloadProxyConfig
}

/** 可选分区也必须是对象，避免损坏配置静默回退。 */
function object(value: unknown): Record<string, unknown> {
  if (value === undefined)
    return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(cliM('cli_download_invalid'))
  return value as Record<string, unknown>
}

/** 校验 npm registry，拒绝把认证信息保存在项目配置中。 */
function registryUrl(value: unknown): string {
  try {
    if (typeof value !== 'string')
      throw new Error('Missing registry')
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid registry')
    return url.toString().replace(/\/$/, '')
  }
  catch { throw new Error(cliM('cli_download_invalid')) }
}

/**
 * 首次交互选择保存项目默认；显式命令参数只覆盖本次。
 * @param directory - 含 hai.json 的项目根或服务目录。
 * @param options - 命令覆盖及非交互设置。
 * @returns 已校验的下载源和代理。
 * @throws Error - 配置无效、系统代理不可读或交互取消。
 * @example 模块内部上下文
 * ```ts
 * const downloads = await resolveBuildDownloads('/workspace/shop', { yes: true, imageSource: 'cn', npmSource: 'cn' })
 * ```
 */
export async function resolveBuildDownloads(directory: string, options: BuildDownloadOptions): Promise<BuildDownloads> {
  const path = projectConfigPath(directory)
  const project = readProjectConfig(path)
  const build = object(project.build)
  const sources = object(build.sources)
  const savedImage = object(sources.image)
  const savedNpm = object(sources.npm)
  const savedProxy = object(build.proxy)
  const interactive = !!process.stdin.isTTY && !options.yes
  const choose = async (message: string, values: Array<'official' | 'cn' | 'custom' | 'inherit' | 'system' | 'none'>): Promise<string> => {
    const answer = await prompts({ type: 'select', name: 'value', message, choices: values.map(value => ({ title: cliM(`cli_download_${value}`), value })) })
    if (typeof answer.value !== 'string')
      throw new Error(cliM('cli_deploy_cancelled'))
    return answer.value
  }
  const mirrorEntries = options.imageMirrors?.split(',').map((entry) => {
    const separator = entry.indexOf('=')
    if (separator <= 0 || separator === entry.length - 1)
      throw new Error(cliM('cli_download_invalid'))
    return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]
  })
  if (mirrorEntries && new Set(mirrorEntries.map(([key]) => key)).size !== mirrorEntries.length)
    throw new Error(cliM('cli_download_invalid'))
  let imageType = options.imageSource ?? (mirrorEntries ? 'custom' : savedImage.type)
  let npmType = options.npmSource ?? (options.npmRegistry ? 'custom' : savedNpm.type)
  const saveImage = imageType === undefined && interactive
  const saveNpm = npmType === undefined && interactive
  if (saveImage)
    imageType = await choose(cliM('cli_download_choose_image'), ['official', 'cn', 'custom'])
  if (saveNpm)
    npmType = await choose(cliM('cli_download_choose_npm'), ['official', 'cn', 'custom'])
  imageType ??= 'official'
  npmType ??= 'official'
  if (typeof imageType !== 'string' || !['official', 'cn', 'custom'].includes(imageType) || typeof npmType !== 'string' || !['official', 'cn', 'custom'].includes(npmType))
    throw new Error(cliM('cli_download_invalid'))
  let registries = mirrorEntries ? Object.fromEntries(mirrorEntries) : savedImage.registries
  if (imageType === 'custom' && !registries && interactive) {
    const answer = await prompts({ type: 'text', name: 'value', message: cliM('cli_download_image_mirrors') })
    if (typeof answer.value !== 'string' || !answer.value.trim())
      throw new Error(cliM('cli_deploy_cancelled'))
    registries = Object.fromEntries(answer.value.split(',').map((entry: string) => {
      const index = entry.indexOf('=')
      if (index <= 0)
        throw new Error(cliM('cli_download_invalid'))
      return [entry.slice(0, index).trim(), entry.slice(index + 1).trim()]
    }))
  }
  const mappings = registries === undefined ? undefined : object(registries)
  if (mappings && Object.entries(mappings).some(([key, value]) => !/^[\w.-]+(?::\d+)?$/.test(key) || typeof value !== 'string'))
    throw new Error(cliM('cli_download_invalid'))
  const imageSource: ImageSourceConfig = { type: imageType as ImageSourceConfig['type'], ...(imageType === 'custom' ? { registries: mappings as Record<string, string> | undefined } : {}) }
  if (mirrorEntries && imageType !== 'custom')
    throw new Error(cliM('cli_download_invalid'))
  if (imageType === 'custom') {
    if (!mappings || !Object.keys(mappings).length)
      throw new Error(cliM('cli_download_invalid'))
    for (const key of Object.keys(mappings)) resolveImageReference(`${key}/hai-source-check:1`, imageSource)
  }
  let customRegistry = options.npmRegistry ?? savedNpm.registry
  if (npmType === 'custom' && !customRegistry && interactive) {
    const answer = await prompts({ type: 'text', name: 'value', message: cliM('cli_download_npm_registry') })
    if (typeof answer.value !== 'string' || !answer.value.trim())
      throw new Error(cliM('cli_deploy_cancelled'))
    customRegistry = answer.value
  }
  if (options.npmRegistry && npmType !== 'custom')
    throw new Error(cliM('cli_download_invalid'))
  const npmRegistry = npmType === 'cn' ? 'https://registry.npmmirror.com' : npmType === 'official' ? 'https://registry.npmjs.org' : registryUrl(customRegistry)
  const npmSource: BuildDownloads['npmSource'] = { type: npmType as BuildDownloads['npmSource']['type'], ...(npmType === 'custom' ? { registry: npmRegistry } : {}) }
  let proxyMode = options.proxyMode ?? (options.proxyUrl ? 'custom' : savedProxy.mode)
  const saveProxy = proxyMode === undefined && interactive && options.httpProxy !== false
  if (saveProxy)
    proxyMode = await choose(cliM('cli_download_choose_proxy'), ['inherit', 'system', 'custom', 'none'])
  proxyMode ??= 'inherit'
  if (options.proxyUrl !== undefined && proxyMode !== 'custom')
    throw new Error(cliM('cli_download_invalid'))
  if (typeof proxyMode !== 'string' || !['inherit', 'system', 'custom', 'none'].includes(proxyMode))
    throw new Error(cliM('cli_download_invalid'))
  if (options.httpProxy === false && (options.proxyUrl !== undefined || (options.proxyMode !== undefined && options.proxyMode !== 'none')))
    throw new Error(cliM('cli_download_invalid'))
  let proxyUrl = options.proxyUrl ?? savedProxy.url
  if (proxyMode === 'custom' && !proxyUrl && interactive) {
    const answer = await prompts({ type: 'text', name: 'value', message: cliM('cli_download_proxy_url') })
    if (typeof answer.value !== 'string' || !answer.value.trim())
      throw new Error(cliM('cli_deploy_cancelled'))
    proxyUrl = answer.value
  }
  const bypass = options.proxyBypass ?? savedProxy.bypass
  if ((proxyUrl !== undefined && typeof proxyUrl !== 'string') || (bypass !== undefined && typeof bypass !== 'string'))
    throw new Error(cliM('cli_download_invalid'))
  const proxy: DownloadProxyConfig = { mode: options.httpProxy === false ? 'none' : proxyMode as DownloadProxyConfig['mode'], ...(proxyMode === 'custom' && options.httpProxy !== false ? { url: proxyUrl as string | undefined } : {}), ...(bypass !== undefined ? { bypass: bypass as string } : {}) }
  resolveDownloadProxy(proxy)
  if (saveImage || saveNpm || saveProxy) {
    project.build = { ...build, sources: { ...sources, ...(saveImage ? { image: imageSource } : {}), ...(saveNpm ? { npm: npmSource } : {}) }, ...(saveProxy ? { proxy } : {}) }
    writeFileSync(path, `${JSON.stringify(project, null, 2)}\n`)
  }
  return { imageSource, npmRegistry, npmSource, proxy }
}

/**
 * 按显式构建网络处理回环代理；Podman 默认网络保留调用者地址。
 * @param proxy - 本次代理配置。
 * @param runtime - 实际构建引擎。
 * @param network - 显式构建网络；host 网络保留回环地址。
 * @returns 预定义代理构建参数。
 * @example 模块内部上下文
 * ```ts
 * const args = buildProxyArguments({ mode: 'custom', url: 'http://127.0.0.1:10808' }, 'podman', 'pasta')
 * ```
 */
export function buildProxyArguments(proxy: DownloadProxyConfig, runtime: string, network?: string): string[] {
  const environment = resolveDownloadProxy(proxy)
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    if (!environment[key])
      continue
    const url = new URL(environment[key])
    if (network !== 'host' && (runtime === 'docker' || network !== undefined) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.hostname = runtime === 'podman' ? 'host.containers.internal' : 'host.docker.internal'
      environment[key] = url.toString().replace(/\/$/, '')
    }
  }
  return Object.entries(environment).flatMap(([key, value]) => ['--build-arg', `${key}=${value}`])
}

/**
 * 打包前检查本机代理端口，并单独报告引擎拉取代理的配置边界。
 * @param runtime - 实际或待探测的容器引擎。
 * @param proxy - 本次代理配置。
 * @returns 本机端口检查完成；引擎侧无法核实时显示说明。
 * @throws Error - 代理端口不可达或代理配置非法。
 * @example 模块内部上下文
 * ```ts
 * await preflightDownloadProxy('auto', { mode: 'inherit' })
 * ```
 */
export async function preflightDownloadProxy(runtime: string, proxy: DownloadProxyConfig): Promise<void> {
  const environment = resolveDownloadProxy(proxy)
  for (const value of new Set([environment.HTTP_PROXY, environment.HTTPS_PROXY].filter(Boolean))) {
    const url = new URL(value)
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) })
      socket.setTimeout(3000)
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      const fail = (): void => {
        socket.destroy()
        reject(new Error(cliM('cli_download_proxy_unreachable')))
      }
      socket.once('error', fail)
      socket.once('timeout', fail)
    })
  }
  if (!environment.HTTP_PROXY && !environment.HTTPS_PROXY)
    return
  for (const candidate of runtime === 'auto' ? ['podman', 'docker'] : [runtime]) {
    try {
      const data: { HTTPProxy?: string, HTTPSProxy?: string, host?: { serviceIsRemote?: boolean } } = JSON.parse(execFileSync(candidate, ['info', '--format', '{{json .}}'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }))
      writeCliMessage(cliM(candidate === 'docker' && (data.HTTPProxy || data.HTTPSProxy) ? 'cli_download_engine_proxy_configured' : candidate === 'podman' && !data.host?.serviceIsRemote ? 'cli_download_engine_proxy_local' : 'cli_download_engine_proxy_hint', { params: { runtime: candidate } }))
      return
    }
    catch { /* 继续检查另一可用引擎，不替用户启动或修改引擎。 */ }
  }
  writeCliMessage(cliM('cli_download_engine_proxy_hint', { params: { runtime } }))
}

/**
 * 新的 npm 源必须有模板支持，避免命令成功但选源未生效。
 * @param file - 实际 Dockerfile 路径。
 * @param downloads - 本次已校验的下载配置。
 * @throws Error - 旧 Dockerfile 不支持所选源。
 * @example 模块内部上下文
 * ```ts
 * const downloads = await resolveBuildDownloads('/workspace/shop', { yes: true })
 * validateDownloadDockerfile('/workspace/shop/images/serv.Dockerfile', downloads)
 * ```
 */
export function validateDownloadDockerfile(file: string, downloads: BuildDownloads): void {
  const content = readFileSync(file, 'utf8')
  if ((downloads.imageSource.type !== 'official' && !/^ARG HAI_NODE_IMAGE=/m.test(content))
    || (downloads.npmSource.type !== 'official' && !/^ARG HAI_NPM_REGISTRY[=\s]/m.test(content))) {
    throw new Error(cliM('cli_download_template_required', { params: { path: file } }))
  }
}
