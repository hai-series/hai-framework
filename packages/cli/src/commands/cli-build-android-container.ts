/** Android 容器构建：只装配构建工具链和工作副本，签名材料在运行阶段挂载。 */
import type { BuildDownloads } from './cli-build-downloads.js'
import type { NativeArtifact } from './cli-build-native.js'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { resolveImageReference } from '@h-ai/deploy'
import { cliM } from '../cli-i18n.js'
import { buildProxyArguments } from './cli-build-downloads.js'
import { isNativeZip, nativeFiles, nativeProjectDirectory } from './cli-build-native.js'

// 工作副本无旧 APK；每个原生工程按自己的 Gradle wrapper 构建与验签。
const packageAndroid = String.raw`
set -euo pipefail
# 容器的 Gradle 进程无法跨网络命名空间协商缓存锁，先锁定共享缓存。
exec 9>/cache/build.lock
flock 9
variant=$1
shift
cd /workspace
pnpm install --frozen-lockfile --prefer-offline --prod=false --store-dir /cache/pnpm
export GRADLE_OPTS="$(node -e '
  for (const protocol of ["http", "https"]) {
    const value = process.env[protocol.toUpperCase() + "_PROXY"];
    if (value) {
      const url = new URL(value);
      process.stdout.write("-D" + protocol + ".proxyHost=" + url.hostname + " -D" + protocol + ".proxyPort=" + (url.port || (url.protocol === "https:" ? "443" : "80")) + " ");
    }
  }
  if (process.env.NO_PROXY) {
    const exclusions = process.env.NO_PROXY.split(",").map(value => value.trim().replace(/^\./, "*.").replace(/:\d+$/, ""));
    process.stdout.write("-Dhttp.nonProxyHosts=" + exclusions.join("|"));
  }
')"
for app in "$@"; do
  cd /workspace
  pnpm --filter "{./$app}^..." --if-present run build
  cd "$app"
  pnpm run build
  if [ -d android ]; then
    pnpm exec cap sync android
  else
    pnpm exec cap add android
    # 临时原生壳仅需 Gradle 运行文件；保留已声明校验和的分发包。
    node -e '
      const fs = require("node:fs");
      const file = "android/gradle/wrapper/gradle-wrapper.properties";
      const settings = fs.readFileSync(file, "utf8");
      if (!/^\s*distributionSha256Sum\s*=/m.test(settings))
        fs.writeFileSync(file, settings.replace(/^(distributionUrl=.*\/gradle-[0-9.]+)-all\.zip(\r?)$/m, "$1-bin.zip$2"));
    '
  fi
  node -e 'if (require("./android/app/src/main/assets/capacitor.config.json").server?.url) throw new Error("APK requires bundled WebView assets")'
  cd android
  bash ./gradlew --no-daemon "assemble$variant"
done
`

// 签名容器独立于 npm/Gradle 构建，关闭网络，仅运行 Android 验签工具。
const verifyAndroid = String.raw`
set -euo pipefail
variant=$1
shift
apksigner="$ANDROID_HOME/build-tools/36.0.0/apksigner"
for apk in "$@"; do
  if [ "$variant" = release ]; then
    "$apksigner" sign --ks /run/hai/android-keystore --ks-key-alias "$HAI_ANDROID_KEY_ALIAS" \
      --ks-pass env:HAI_ANDROID_STORE_PASSWORD --key-pass env:HAI_ANDROID_KEY_PASSWORD --out "$apk.signed" "$apk"
    "$apksigner" verify "$apk.signed"
    mv "$apk.signed" "$apk"
  else
    "$apksigner" verify "$apk"
  fi
done
`

const copyExclusions = new Set(['node_modules', '.git', '.hai', '.turbo', '.svelte-kit', '.pnpm-store', '.cache', '.gradle', '.idea', 'test-results', 'playwright-report', 'local.properties'])

/**
 * 容器构建使用已解析的下载设置和选定的运行时命令。
 * @example 模块内部上下文
 * ```ts
 * const options: AndroidContainerOptions = {
 *   runtime: 'docker',
 *   debug: true,
 *   downloads: {
 *     imageSource: { type: 'official' },
 *     npmRegistry: 'https://registry.npmjs.org',
 *     npmSource: { type: 'official' },
 *     proxy: { mode: 'inherit' },
 *   },
 *   run: async (args) => { process.stdout.write(args.join(' ')) },
 * }
 * ```
 */
interface AndroidContainerOptions {
  runtime: string
  network?: string
  debug: boolean
  downloads: BuildDownloads
  /** 只允许已解析的公开名称与模式，运行时配置不进入构建工作副本。 */
  environment?: Record<string, string>
  run: (args: string[], quiet?: boolean, environment?: Record<string, string>) => Promise<void>
}

/** 应用可有自己的 hai.json，依赖安装仍从最近的锁文件所在目录执行。 */
function dependencyRoot(project: string): string {
  for (let directory = project; ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'pnpm-lock.yaml')))
      return directory
    if (directory === dirname(directory))
      return project
  }
}

/** 从 App 的依赖树定位随 Capacitor 包交付的构建定义。 */
function androidDockerfile(root: string, app: string): string {
  for (let directory = app; ; directory = dirname(directory)) {
    const file = join(directory, 'node_modules/@h-ai/capacitor/images/android.Dockerfile')
    if (existsSync(file))
      return file
    if (directory === root)
      throw new Error(cliM('cli_build_android_dockerfile'))
  }
}

/** 对 Docker/Podman 的 CSV mount 参数转义含逗号或引号的宿主路径。 */
function bindMount(source: string, target: string, readOnly = false): string[] {
  const field = `source=${source}`
  return ['--mount', `type=bind,"${field.replaceAll('"', '""')}",target=${target}${readOnly ? ',readonly' : ''}`]
}

/**
 * 构建并消费临时工作副本，复制出校验后的 APK 再释放工作副本。
 * @example 模块内部上下文
 * ```ts
 * const build = (root: string, options: AndroidContainerOptions, archive: (artifacts: NativeArtifact[]) => Promise<string[]>) =>
 *   buildContainerAndroid(root, ['apps/shop-app'], options, archive)
 * ```
 */
export async function buildContainerAndroid<T>(root: string, apps: readonly string[], options: AndroidContainerOptions, publish: (artifacts: NativeArtifact[]) => Promise<T>): Promise<T> {
  const { runtime, network, debug, downloads, run } = options
  if (!apps.length)
    throw new Error(cliM('cli_build_app_platform'))
  const directories = apps.map(app => nativeProjectDirectory(root, app))
  for (const directory of directories) {
    if (!existsSync(join(directory, 'capacitor.config.ts')) || (!debug && !existsSync(join(directory, 'android'))))
      throw new Error(cliM('cli_build_app_missing', { params: { platform: 'android' } }))
  }
  const signing: Record<string, string> = {}
  let keystore: string | undefined
  if (!debug) {
    const values = {
      HAI_ANDROID_STORE_PASSWORD: process.env.HAI_ANDROID_STORE_PASSWORD,
      HAI_ANDROID_KEY_ALIAS: process.env.HAI_ANDROID_KEY_ALIAS,
      HAI_ANDROID_KEY_PASSWORD: process.env.HAI_ANDROID_KEY_PASSWORD,
    }
    for (const [key, value] of Object.entries(values)) {
      if (!value)
        throw new Error(cliM('cli_build_android_signing'))
      signing[key] = value
    }
    const path = process.env.HAI_ANDROID_KEYSTORE
    if (!path || !existsSync(resolve(root, path)) || !statSync(resolve(root, path)).isFile())
      throw new Error(cliM('cli_build_android_signing'))
    keystore = resolve(root, path)
  }
  const dependencies = dependencyRoot(root)
  const definition = androidDockerfile(dependencies, directories[0])
  const source = readFileSync(definition, 'utf8')
  const base = /^ARG HAI_ANDROID_IMAGE=(\S+)$/m.exec(source)?.[1]
  if (!base)
    throw new Error(cliM('cli_build_android_dockerfile'))
  const image = resolveImageReference(base, downloads.imageSource)
  const fingerprint = createHash('sha256').update(source).update(JSON.stringify([image, downloads.npmRegistry])).digest('hex').slice(0, 24)
  const builder = `localhost/hai-capacitor-android:${fingerprint}`
  const proxyArgs = buildProxyArguments(downloads.proxy, runtime, network)
  const engineArgs = [
    ...(network === undefined ? [] : ['--network', network]),
    ...(runtime === 'docker' && process.platform === 'linux' && network !== 'host' ? ['--add-host', 'host.docker.internal:host-gateway'] : []),
    ...(runtime === 'podman' && downloads.proxy.mode === 'none' ? ['--http-proxy=false'] : []),
  ]
  try {
    await run(['image', 'inspect', builder], true)
  }
  catch {
    await run(['build', '--platform', 'linux/amd64', ...engineArgs, ...(runtime === 'podman' ? ['--format', 'docker'] : []), '-f', definition, '-t', builder, '--build-arg', `HAI_ANDROID_IMAGE=${image}`, '--build-arg', `HAI_NPM_REGISTRY=${downloads.npmRegistry}`, ...proxyArgs, dirname(definition)])
  }
  const cache = join(root, '.hai', 'build', 'cache', 'android')
  // 后续调试包继续使用本工程的 Android 调试证书，允许覆盖安装。
  mkdirSync(join(cache, 'android-user'), { recursive: true })
  const temporary = mkdtempSync(join(tmpdir(), 'hai-android-'))
  const workspace = join(temporary, 'workspace')
  try {
    cpSync(dependencies, workspace, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (path) => {
        if (path === dependencies)
          return true
        const name = basename(path)
        if (path === keystore || copyExclusions.has(name) || /^\.env(?:\.|$)|\.(?:jks|keystore|p12|pfx)$/i.test(name))
          return false
        if (!['build', 'dist', 'data', 'tmp'].includes(name))
          return true
        const parent = dirname(path)
        // 只排除包根和 Gradle 工程的生成目录，保留源码内同名的资源目录。
        return parent !== dependencies && !existsSync(join(parent, 'package.json'))
          && (name !== 'build' || (!existsSync(join(parent, 'build.gradle')) && !existsSync(join(parent, 'build.gradle.kts'))))
      },
    })
    const proxy = Object.fromEntries(proxyArgs.filter((_, index) => index % 2 === 1).map((argument) => {
      const equals = argument.indexOf('=')
      return [argument.slice(0, equals), argument.slice(equals + 1)]
    }))
    const uid = process.getuid?.()
    const gid = process.getgid?.()
    const userArgs = uid === undefined || gid === undefined
      ? []
      : [
          ...(runtime === 'podman' && uid !== 0 ? ['--userns=keep-id'] : []),
          '--user',
          `${uid}:${gid}`,
        ]
    const relativeApps = directories.map(path => relative(dependencies, path).split(sep).join('/') || '.')
    const environment = { ...proxy, ...options.environment, npm_config_registry: downloads.npmRegistry, npm_config_nodedir: '/usr/local' }
    const workspaceMount = bindMount(workspace, '/workspace')
    await run([
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      ...engineArgs,
      ...userArgs,
      ...workspaceMount,
      ...bindMount(cache, '/cache'),
      '--env',
      'HOME=/tmp',
      '--env',
      'XDG_CACHE_HOME=/cache/xdg',
      '--env',
      'GRADLE_USER_HOME=/cache/gradle',
      '--env',
      'ANDROID_USER_HOME=/cache/android-user',
      '--env',
      'NODE_ENV=production',
      '--env',
      'HAI_BUILD_ID',
      '--env',
      'HAI_BUILD_COMMIT',
      ...Object.keys(environment).flatMap(key => ['--env', key]),
      builder,
      'bash',
      '-c',
      packageAndroid,
      'hai-android',
      debug ? 'Debug' : 'Release',
      ...relativeApps,
    ], false, environment)
    const artifacts: NativeArtifact[] = []
    for (const [index, app] of relativeApps.entries()) {
      const output = join(workspace, app, 'android/app/build/outputs/apk')
      const variant = debug ? 'debug' : 'release'
      const files = [...nativeFiles(output, (path, isDirectory) => !isDirectory && path.endsWith('.apk') && basename(dirname(path)) === variant).keys()]
      if (!files.length || !files.every(isNativeZip))
        throw new Error(cliM('cli_build_app_artifact'))
      artifacts.push(...files.map(path => ({ source: path, file: join(relative(root, directories[index]), relative(output, path).replace(/-unsigned\.apk$/, '.apk')) })))
    }
    await run([
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '--network',
      'none',
      ...userArgs,
      ...workspaceMount,
      ...(keystore ? bindMount(keystore, '/run/hai/android-keystore', true) : []),
      '--env',
      'HOME=/tmp',
      ...Object.keys(signing).flatMap(key => ['--env', key]),
      builder,
      'bash',
      '-c',
      verifyAndroid,
      'hai-android',
      debug ? 'debug' : 'release',
      ...artifacts.map(({ source }) => `/workspace/${relative(workspace, source).split(sep).join('/')}`),
    ], false, signing)
    return await publish(artifacts)
  }
  finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}
