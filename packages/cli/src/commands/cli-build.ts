/** `pnpm build` 的环境无关构建入口：源码、OCI 镜像或 Tauri 安装包。 */
import type { DeploymentArtifact } from '@h-ai/deploy'
import type { GlobalOptions } from '../cli-types.js'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'
import { readProjectConfig } from './cli-project-config.js'

/**
 * 构建参数，不接受部署环境。
 * 对应 hai build --target docker --images app,web --runtime podman --no-http-proxy；镜像参数仅用于 docker，platform/arch 仅用于 desktop。
 * @example 模块内部上下文
 * ```ts
 * const options: BuildCommandOptions = { cwd: '/workspace/shop', target: 'docker', images: 'app,web', runtime: 'podman', httpProxy: false }
 * ```
 */
export interface BuildCommandOptions extends GlobalOptions {
  /** compile 编译源码，docker 导出镜像，desktop 调用 Tauri。 */
  target?: 'compile' | 'docker' | 'desktop'
  /** 逗号分隔的应用镜像名；省略时构建全部。 */
  images?: string
  /** auto 优先使用可达的 Podman。 */
  runtime?: 'auto' | 'podman' | 'docker'
  /** 容器构建网络，默认采用引擎设置；例如 rootless Podman 的 pasta。 */
  network?: string
  /** 原生安装包的目标系统，必须与构建主机相同。 */
  platform?: 'windows' | 'linux' | 'macos'
  /** Rust 目标架构，默认当前主机架构。 */
  arch?: 'x64' | 'arm64'
  /** 可信 SQLite 预编译包根地址，不包含凭据。 */
  sqlitePrebuildMirror?: string
  /** Podman 是否继承代理。 */
  httpProxy?: boolean
}

/**
 * 项目构建描述；app/web 共用 buildId。
 * 从 hai.json 的 build 分区读取；镜像名称为 app/web，构建命令还会校验唯一性与路径边界。
 * @example 模块内部上下文
 * ```ts
 * const config: BuildConfig = { images: [{ name: 'app', context: '.', dockerfile: 'images/app.Dockerfile', containerPort: 3000 }], desktop: ['apps/shop-desktop'] }
 * ```
 */
interface BuildConfig {
  images?: Array<{ name: 'app' | 'web', context?: string, dockerfile: string, containerPort?: number }>
  desktop?: string[]
}

/** 子进程不经过 shell；pnpm 使用当前原生或 JS 入口，兼容 Windows 路径。 */
async function run(command: string, args: string[], cwd: string, quiet = false): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:HAI_|PUBLIC_|VITE_)/.test(key)))
    env.NODE_ENV = 'production'
    // Tauri 的 CI 参数只接受 true/false，兼容 CI 平台常用的 1/0 写法。
    if (env.CI === '1' || env.CI === '0')
      env.CI = env.CI === '1' ? 'true' : 'false'
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: quiet ? 'ignore' : 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(cliM('cli_build_failed', { params: { command, code: String(code) } }))))
  })
}

/** 使用已安装的 pnpm，不通过 Corepack 下载另一套工具链。 */
async function pnpm(args: string[], cwd: string): Promise<void> {
  const entry = process.env.npm_execpath
  if (entry && /(?:^|[/\\])pnpm(?:-native)?(?:\.exe|\.[cm]?js)?$/i.test(entry))
    return /\.[cm]?js$/i.test(entry) ? run(process.execPath, [entry, ...args], cwd) : run(entry, args, cwd)
  // CLI 直接调用时从 PATH 定位原生或 JS 入口；Windows 的 .cmd 不能由无 shell spawn 执行。
  if (process.platform === 'win32') {
    const directories = (process.env.PATH ?? '').split(';')
    for (const directory of directories) {
      const executable = join(directory, 'pnpm.exe')
      if (existsSync(executable))
        return run(executable, args, cwd)
      for (const relative of ['node_modules/pnpm/bin/pnpm.cjs', 'pnpm.cjs']) {
        const candidate = join(directory, relative)
        if (existsSync(candidate))
          return run(process.execPath, [candidate, ...args], cwd)
      }
    }
    throw new Error(cliM('cli_build_use_pnpm'))
  }
  return run('pnpm', args, cwd)
}

/**
 * 构建已有项目；镜像清单仅在全部镜像导出成功后发布。
 * compile 调用项目 compile 脚本；docker 发布完整产物清单后才更新 latest；desktop 仅允许当前主机对应平台。
 * @throws Error - 参数、构建配置、运行时探测或子进程执行失败。
 * @param options - 命令参数；对应命令的工作目录、非交互与可选功能。
 * @returns 所选目标构建完成；失败时抛出异常。
 * @example 模块内部上下文
 * ```ts
 * // 前提：当前项目已有 compile 脚本及已安装依赖。
 * await buildCommand({ cwd: process.cwd(), target: 'compile' })
 * // 等价命令：hai build --target compile；失败抛出异常。
 * ```
 */
export async function buildCommand(options: BuildCommandOptions): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const target = options.target ?? 'compile'
  if (!['compile', 'docker', 'desktop'].includes(target))
    throw new Error(cliM('cli_build_target_invalid'))
  if ((target !== 'docker' && (options.images !== undefined || options.runtime !== undefined || options.network !== undefined || options.sqlitePrebuildMirror !== undefined || options.httpProxy === false))
    || (target !== 'desktop' && (options.platform !== undefined || options.arch !== undefined))) {
    throw new Error(cliM('cli_build_options_invalid'))
  }
  if (target === 'compile') {
    await pnpm(['run', 'compile'], cwd)
    return
  }
  const metadata: { version?: unknown } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  // 版本同时进入文件名和镜像标签；拒绝路径字符，保留预发布和构建元数据。
  const appVersion = metadata.version
  if (typeof appVersion !== 'string' || appVersion.length > 80 || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i.test(appVersion))
    throw new Error(cliM('cli_build_version_invalid'))
  const project = readProjectConfig(join(cwd, 'hai.json'))
  const config = (project.build ?? {}) as BuildConfig
  if (target === 'desktop') {
    const platforms = { win32: 'windows', linux: 'linux', darwin: 'macos' } as const
    const host = platforms[process.platform as keyof typeof platforms]
    const platform = options.platform ?? host
    const arch = options.arch ?? process.arch
    if (!platform || platform !== host || !['x64', 'arm64'].includes(arch))
      throw new Error(cliM('cli_build_native_host'))
    if (!config.desktop?.length)
      throw new Error(cliM('cli_build_desktop_missing'))
    const rustTarget = `${arch === 'x64' ? 'x86_64' : 'aarch64'}-${platform === 'windows' ? 'pc-windows-msvc' : platform === 'macos' ? 'apple-darwin' : 'unknown-linux-gnu'}`
    const bundles = platform === 'windows' ? 'nsis' : platform === 'macos' ? 'app,dmg' : 'deb,appimage'
    for (const directory of config.desktop)
      await pnpm(['exec', 'tauri', 'build', '--target', rustTarget, '--bundles', bundles, '--config', JSON.stringify({ version: appVersion })], resolve(cwd, directory))
    writeCliMessage(cliM('cli_build_native_ready', { params: { target: rustTarget } }))
    return
  }
  if (!Array.isArray(config.images) || !config.images.length || config.images.some(image => !image || typeof image !== 'object') || config.images.filter(image => image.name === 'app').length !== 1 || config.images.length > 2 || new Set(config.images.map(image => image.name)).size !== config.images.length
    || config.images.some(image => !['app', 'web'].includes(image.name) || typeof image.dockerfile !== 'string' || !image.dockerfile || 'target' in image || (image.containerPort !== undefined && (!Number.isInteger(image.containerPort) || image.containerPort < 1 || image.containerPort > 65535)))) {
    throw new Error(cliM('cli_build_images_missing'))
  }
  const selected = options.images?.split(',').map(name => name.trim())
  if (selected && (selected.some(name => !config.images!.some(image => image.name === name)) || new Set(selected).size !== selected.length))
    throw new Error(cliM('cli_build_selection_invalid'))
  const images = config.images.filter(image => !selected || selected.includes(image.name))
  for (const image of images) {
    if (!existsSync(resolve(cwd, image.dockerfile)))
      throw new Error(cliM('cli_build_dockerfile_missing', { params: { path: image.dockerfile } }))
  }
  const candidates = options.runtime && options.runtime !== 'auto' ? [options.runtime] : ['podman', 'docker']
  if (candidates.some(runtime => !['podman', 'docker'].includes(runtime)))
    throw new Error(cliM('cli_build_runtime_missing'))
  let runtime: string | undefined
  for (const candidate of candidates) {
    try {
      await run(candidate, ['version'], cwd, true)
      runtime = candidate
      break
    }
    catch { /* 尝试下一个可达的引擎。 */ }
  }
  if (!runtime)
    throw new Error(cliM('cli_build_runtime_missing'))
  if (options.sqlitePrebuildMirror) {
    const url = new URL(options.sqlitePrebuildMirror)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error(cliM('cli_build_mirror_invalid'))
  }
  const buildId = `${appVersion}-${Date.now()}-${randomBytes(3).toString('hex')}`
  const artifact: DeploymentArtifact = { version: 3, appVersion, buildId, partial: images.length !== config.images.length, hasWeb: config.images.some(image => image.name === 'web'), images: [] }
  // 部分构建仍保留工程显式声明的端口，不用构建默认值覆盖部署配置。
  for (const image of config.images) {
    if (image.containerPort !== undefined)
      artifact[image.name === 'app' ? 'appContainerPort' : 'webContainerPort'] = image.containerPort
  }
  const parent = join(cwd, '.hai/build/docker')
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, '.building-'))
  const built: string[] = []
  try {
    for (const context of new Set(images.map(image => resolve(cwd, image.context ?? '.'))))
      prepareDependencyInputs(context)
    for (const image of images) {
      if (!['app', 'web'].includes(image.name))
        throw new Error(cliM('cli_build_images_missing'))
      const context = resolve(cwd, image.context ?? '.')
      const imageRef = `localhost/hai-${basenameSafe(cwd)}-${image.name}:${buildId.toLowerCase().replaceAll('+', '_')}`
      const args = ['build', '-f', resolve(cwd, image.dockerfile), '-t', imageRef]
      if (options.network !== undefined)
        args.push('--network', options.network)
      const ignore = `${resolve(cwd, image.dockerfile)}.dockerignore`
      if (runtime === 'podman' && existsSync(ignore))
        args.push('--ignorefile', ignore)
      if (runtime === 'podman') {
        args.push('--format', 'docker', '--jobs', '1', ...(options.httpProxy === false ? ['--http-proxy=false'] : []))
        // Windows/macOS 的远程 Podman 默认读取服务端代理；显式传递预定义构建参数。
        if (options.httpProxy !== false) {
          for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'FTP_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'ftp_proxy', 'no_proxy']) {
            if (process.env[key])
              args.push('--build-arg', `${key}=${process.env[key]}`)
          }
        }
      }
      if (options.sqlitePrebuildMirror)
        args.push('--build-arg', `SQLITE_PREBUILD_MIRROR=${options.sqlitePrebuildMirror}`)
      built.push(imageRef)
      await run(runtime, [...args, context], cwd)
      const file = `${image.name}-${appVersion}.tar`
      await run(runtime, ['save', ...(runtime === 'podman' ? ['--format', 'docker-archive'] : []), '-o', join(staging, file), imageRef], cwd)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(join(staging, file)))
        hash.update(chunk)
      artifact.images.push({ name: image.name, file, imageRef, sha256: hash.digest('hex'), ...(image.containerPort ? { containerPort: image.containerPort } : {}) })
    }
    // 不覆盖以前成功的构建；manifest 是一次完整构建的提交点。
    const output = join(parent, buildId)
    // 文件名固定于 manifest 同层；通过构建 ID 子目录中的清单消费，latest 仅存相对路径。
    writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify(artifact, null, 2)}\n`)
    renameSync(staging, output)
    writeFileSync(join(parent, `latest-${buildId}`), `${buildId}\n`)
    renameSync(join(parent, `latest-${buildId}`), join(parent, 'latest'))
    writeCliMessage(cliM('cli_build_ready', { params: { path: output, runtime } }))
  }
  catch (error) {
    for (const imageRef of built) {
      try {
        await run(runtime, ['image', 'rm', imageRef], cwd, true)
      }
      catch { /* 构建失败不掩盖原始错误。 */ }
    }
    throw error
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** 生成稳定的依赖上下文；包配置、补丁和本地归档改变才使下载层失效。 */
function prepareDependencyInputs(cwd: string): void {
  const destination = join(cwd, 'images', 'dependencies')
  mkdirSync(destination, { recursive: true })
  const tracking = join(destination, '.managed.json')
  const previous: string[] = existsSync(tracking) ? JSON.parse(readFileSync(tracking, 'utf8')) : []
  const files: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const source = join(directory, entry.name)
      if (source === destination || ['node_modules', '.git', '.hai', '.turbo', '.svelte-kit', '.pnpm-store', '.cache', 'dist', 'build', 'data', 'tmp', 'test-results', 'playwright-report'].includes(entry.name))
        continue
      if (entry.isDirectory()) {
        walk(source)
        continue
      }
      if (!entry.isFile() || !(entry.name === 'package.json' || entry.name === '.pnpmfile.cjs' || /\.(?:tgz|patch)$/.test(entry.name)))
        continue
      const file = relative(cwd, source)
      mkdirSync(dirname(join(destination, file)), { recursive: true })
      const target = join(destination, file)
      if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target)))
        copyFileSync(source, target)
      files.push(file)
    }
  }
  walk(cwd)
  for (const file of previous) {
    const target = resolve(destination, file)
    if (!files.includes(file) && !relative(destination, target).startsWith('..'))
      rmSync(target, { force: true })
  }
  const content = `${JSON.stringify(files)}\n`
  if (!existsSync(tracking) || readFileSync(tracking, 'utf8') !== content)
    writeFileSync(tracking, content)
}

/** 将当前目录名转为安全镜像名称。 */
function basenameSafe(directory: string): string {
  return directory.slice(dirname(directory).length + 1).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '') || 'app'
}
