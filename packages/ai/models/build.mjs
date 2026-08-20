/**
 * @h-ai/ai — 模型服务构建工具
 *
 * 扫描 `images/*` 下的模型定义（`model.json`），提供列表、校验、权重准备、镜像构建与本地运行能力。
 * 构建工具本身不包含任何模型下载逻辑——权重下载由各模型目录的 `prepare.py` 负责（优先 ModelScope）。
 *
 * 命令：
 *   node models/build.mjs list                          列出全部模型
 *   node models/build.mjs inspect <name>                校验并打印 Manifest
 *   node models/build.mjs prepare <name>                下载权重到 .cache/<name>
 *   node models/build.mjs build <name> --device cpu|gpu 构建镜像（可加 --bundle-model 打包权重）
 *   node models/build.mjs run <name> [--port <p>]       启动服务并做健康检查
 *
 * 容器引擎：
 *   --engine auto|docker|podman                          默认 auto：优先使用已就绪的 Podman，其次 Docker
 *   HAI_CONTAINER_ENGINE=auto|docker|podman              也可通过环境变量指定默认引擎
 *
 * 代理：
 *   --proxy <url>                                        HTTP/HTTPS 通用代理（如 http://127.0.0.1:10809）
 *   --container-proxy <url>                              容器内可访问的 HTTP/HTTPS 代理
 *   --http-proxy / --https-proxy / --all-proxy <url>    分协议覆盖代理
 *   --no-proxy <hosts>                                   不走代理的主机列表
 *   HAI_PROXY / HTTP_PROXY / HTTPS_PROXY / ALL_PROXY     也可通过环境变量配置
 *
 * @module models/build
 */

/* eslint-disable no-console -- 构建工具 CLI 通过 stdout 输出进度与结果 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// 使用 fileURLToPath 保证 Windows `C:\...` 路径正确（不要直接用 URL.pathname）
const CURRENT_FILE = fileURLToPath(import.meta.url)

/** 模型服务根目录 */
export const MODELS_DIR = dirname(CURRENT_FILE)

/** 模型镜像定义目录 */
export const IMAGES_DIR = join(MODELS_DIR, 'images')

/** 权重缓存目录（不进入 git / npm 发布物） */
export const CACHE_DIR = join(MODELS_DIR, '.cache')

/**
 * 模型 Manifest Schema
 *
 * 一个镜像可声明多个 `provides` 能力；
 * `protocol` 决定 Framework 用哪种 Provider 契约调用。
 */
export const ModelManifestSchema = z.object({
  /** Manifest Schema 版本 */
  schemaVersion: z.literal(1),

  /** 镜像定义名称（与目录名一致） */
  name: z.string().min(1),

  /** 镜像版本 */
  version: z.string().min(1),

  /** 容器镜像仓库名（Docker / Podman 通用） */
  image: z.string().min(1),

  /** 服务提供的逻辑能力，至少一项 */
  provides: z.array(z.string().min(1)).min(1),

  /** 服务实现的 Provider 契约 */
  protocol: z.string().min(1),

  /** 支持的运行设备 */
  devices: z.array(z.enum(['cpu', 'gpu'])).min(1),

  /** 容器内服务端口 */
  port: z.number().int().positive(),

  /** 健康检查路径 */
  health: z.string().startsWith('/'),

  /** 首次下载和加载模型允许的启动时间（毫秒） */
  startupTimeout: z.number().int().positive().optional(),

  /** 模型来源（供 prepare.py 使用） */
  model: z.object({
    /** 模型仓库 ID */
    id: z.string().min(1),

    /** 固定的模型版本 / commit */
    revision: z.string().optional(),

    /** 国内默认使用的 ModelScope 仓库 */
    modelscope: z.object({
      id: z.string().min(1),
      revision: z.string().optional(),
    }).optional(),
  }).optional(),

  /** 构建镜像所需的固定源码仓库 */
  source: z.object({
    /** GitHub 仓库 owner/name */
    repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),

    /** 固定到完整 Git commit，保证构建可复现 */
    revision: z.string().regex(/^[a-f0-9]{40}$/),

    /** 固定提交的 Git tree，用于校验文件清单 */
    tree: z.string().regex(/^[a-f0-9]{40}$/),
  }).optional(),
})

/** 模型 Manifest 类型 */
/** @typedef {z.infer<typeof ModelManifestSchema>} ModelManifest */

/**
 * 校验原始 Manifest 对象
 *
 * @param {unknown} raw
 * @returns {import('zod').SafeParseReturnType<unknown, ModelManifest>} 校验结果
 */
export function validateManifest(raw) {
  return ModelManifestSchema.safeParse(raw)
}

/**
 * 列出全部模型镜像名称
 *
 * @returns {string[]} 模型名称列表
 */
export function listImageNames() {
  if (!existsSync(IMAGES_DIR))
    return []

  return readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter(entry =>
      entry.isDirectory()
      && existsSync(join(IMAGES_DIR, entry.name, 'model.json')))
    .map(entry => entry.name)
    .sort()
}

/**
 * 读取并校验指定模型的 Manifest
 *
 * @param {string} name
 * @returns {ModelManifest} 已校验的模型清单
 */
export function loadManifest(name) {
  const file = join(IMAGES_DIR, name, 'model.json')

  if (!existsSync(file))
    throw new Error(`Model image not found: ${name}`)

  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const result = ModelManifestSchema.safeParse(raw)

  if (!result.success)
    throw new Error(`Invalid manifest for ${name}:\n${formatIssues(result.error)}`)
  return result.data
}

/**
 * 加载全部模型 Manifest
 *
 * @returns {ModelManifest[]} 全部已校验的模型清单
 */
export function listImages() {
  return listImageNames().map(loadManifest)
}

/** 将 Zod 校验错误格式化为逐行字段错误 */
function formatIssues(error) {
  return error.issues
    .map(issue =>
      `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

// ─────────────────────────────────────────────────────────────
// CLI 参数
// ─────────────────────────────────────────────────────────────

/** 解析设备参数 */
function parseDevice(args) {
  const index = args.indexOf('--device')
  const device = index >= 0 ? args[index + 1] : 'cpu'

  if (device !== 'cpu' && device !== 'gpu')
    throw new Error(`Invalid --device: ${device} (expected cpu | gpu)`)
  return device
}

/** 读取带默认值的字符串参数 */
function parseFlag(args, name, fallback) {
  const index = args.indexOf(name)

  if (index < 0)
    return fallback

  const value = args[index + 1]

  if (!value || value.startsWith('--'))
    throw new Error(`Missing value for ${name}`)

  return value
}

/** 读取可选字符串参数 */
function parseOptionalFlag(args, name) {
  const index = args.indexOf(name)

  if (index < 0)
    return undefined

  const value = args[index + 1]

  if (!value || value.startsWith('--'))
    throw new Error(`Missing value for ${name}`)

  return value
}

/** 读取正整数参数 */
function parsePositiveIntegerFlag(args, name, fallback) {
  const value = Number(
    parseFlag(args, name, String(fallback)),
  )

  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`Invalid ${name}: expected a positive integer`)
  return value
}

/** 读取宿主机端口。 */
function parsePortFlag(args, name, fallback) {
  const port = parsePositiveIntegerFlag(args, name, fallback)
  if (port > 65535)
    throw new Error(`Invalid ${name}: expected a TCP port between 1 and 65535`)
  return port
}

/** 从多个环境变量中读取第一个非空值 */
function readEnvironment(...names) {
  for (const name of names) {
    const value = process.env[name]

    if (value)
      return value
  }

  return undefined
}

// ─────────────────────────────────────────────────────────────
// Proxy
// ─────────────────────────────────────────────────────────────

/**
 * 校验代理 URL
 *
 * HTTP_PROXY / HTTPS_PROXY 只接受 HTTP(S)。
 * ALL_PROXY 额外允许 SOCKS。
 */
function validateProxyUrl(value, source, allowSocks = false) {
  if (!value)
    return undefined

  let url

  try {
    url = new URL(value)
  }
  catch {
    throw new Error(
      `Invalid ${source}: expected proxy URL such as http://127.0.0.1:10809`,
    )
  }

  const protocols = allowSocks
    ? [
        'http:',
        'https:',
        'socks:',
        'socks4:',
        'socks4a:',
        'socks5:',
        'socks5h:',
      ]
    : [
        'http:',
        'https:',
      ]

  if (!protocols.includes(url.protocol))
    throw new Error(`Invalid ${source}: unsupported proxy protocol ${url.protocol}`)
  return value
}

/**
 * 解析代理配置。
 *
 * 优先级：
 *
 * 协议专用 CLI
 * >
 * --proxy
 * >
 * HAI_PROXY
 * >
 * HTTP_PROXY / HTTPS_PROXY / ALL_PROXY
 */
export function parseProxyConfig(args) {
  const common = validateProxyUrl(
    parseOptionalFlag(args, '--proxy')
    || readEnvironment('HAI_PROXY'),
    '--proxy / HAI_PROXY',
  )

  const http = validateProxyUrl(
    parseOptionalFlag(args, '--http-proxy')
    || common
    || readEnvironment(
      'HTTP_PROXY',
      'http_proxy',
    ),
    '--http-proxy / HTTP_PROXY',
  )

  const https = validateProxyUrl(
    parseOptionalFlag(args, '--https-proxy')
    || common
    || readEnvironment(
      'HTTPS_PROXY',
      'https_proxy',
    ),
    '--https-proxy / HTTPS_PROXY',
  )

  const all = validateProxyUrl(
    parseOptionalFlag(args, '--all-proxy')
    || readEnvironment(
      'ALL_PROXY',
      'all_proxy',
    ),
    '--all-proxy / ALL_PROXY',
    true,
  )

  const noProxy
    = parseOptionalFlag(args, '--no-proxy')
      || readEnvironment(
        'NO_PROXY',
        'no_proxy',
      )

  return {
    http,
    https,
    all,
    noProxy,
  }
}

/**
 * 补充本地地址到 NO_PROXY。
 *
 * 避免健康检查、服务内部本地访问误走代理。
 */
function normalizeNoProxy(value) {
  const entries = (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  for (const item of [
    'localhost',
    '127.0.0.1',
    '::1',
  ]) {
    if (!entries.includes(item))
      entries.push(item)
  }

  return entries.join(',')
}

/**
 * 将宿主机代理地址转换为容器可访问地址。
 *
 * Windows/macOS：
 *
 * Docker:
 *   127.0.0.1 -> host.docker.internal
 *
 * Podman:
 *   127.0.0.1 -> host.containers.internal
 */
function toContainerProxyUrl(value, engine) {
  if (
    !value
    || (
      process.platform !== 'win32'
      && process.platform !== 'darwin'
    )
  ) {
    return value
  }

  const url = new URL(value)

  if (![
    '127.0.0.1',
    'localhost',
    '[::1]',
    '::1',
  ].includes(url.hostname)) {
    return value
  }

  url.hostname = engine === 'docker'
    ? 'host.docker.internal'
    : 'host.containers.internal'

  return url
    .toString()
    .replace(/\/$/, '')
}

/** 判断代理是否只指向当前操作系统的回环地址。 */
function isLoopbackProxy(value) {
  if (!value)
    return false
  const hostname = new URL(value).hostname
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)
}

/**
 * 将代理配置添加到子进程环境。
 *
 * 同时设置大小写形式，以兼容 Python / pip /
 * ModelScope / HuggingFace / curl 等不同工具。
 */
function withProxyEnvironment(baseEnv, proxy) {
  const env = {
    ...baseEnv,
  }

  const pairs = [
    [
      'HTTP_PROXY',
      'http_proxy',
      proxy.http,
    ],
    [
      'HTTPS_PROXY',
      'https_proxy',
      proxy.https,
    ],
    [
      'ALL_PROXY',
      'all_proxy',
      proxy.all,
    ],
    [
      'NO_PROXY',
      'no_proxy',
      proxy.noProxy,
    ],
  ]

  for (const [upper, lower, value] of pairs) {
    if (!value)
      continue

    env[upper] = value
    env[lower] = value
  }

  return env
}

/**
 * 返回容器内可使用的代理配置。
 */
export function containerProxyConfig(args, proxy, engine) {
  const explicit = validateProxyUrl(
    parseOptionalFlag(args, '--container-proxy')
    || readEnvironment('HAI_CONTAINER_PROXY'),
    '--container-proxy / HAI_CONTAINER_PROXY',
  )

  if (explicit) {
    return {
      http: explicit,
      https: explicit,
      all: undefined,
      noProxy: normalizeNoProxy(proxy.noProxy),
    }
  }

  // Podman Desktop 使用独立 VM。宿主机代理只监听回环地址时，容器无法访问该端口。
  const omitPodmanLoopback = engine === 'podman'
    && (process.platform === 'win32' || process.platform === 'darwin')
    && [proxy.http, proxy.https, proxy.all].some(isLoopbackProxy)

  if (omitPodmanLoopback) {
    console.warn(
      'Podman cannot reach a host loopback-only proxy from its VM; '
      + 'the proxy remains enabled for image pulls but is omitted inside build/run containers. '
      + 'Use --container-proxy with a VM-reachable address to override.',
    )
  }

  return {
    http: omitPodmanLoopback
      ? undefined
      : toContainerProxyUrl(
          proxy.http,
          engine,
        ),

    https: omitPodmanLoopback
      ? undefined
      : toContainerProxyUrl(
          proxy.https,
          engine,
        ),

    all: omitPodmanLoopback
      ? undefined
      : toContainerProxyUrl(
          proxy.all,
          engine,
        ),

    noProxy: normalizeNoProxy(
      proxy.noProxy,
    ),
  }
}

/**
 * 构建阶段代理。
 *
 * Docker / Podman 都支持 build args。
 *
 * 这些变量只作用于 Dockerfile RUN 阶段，
 * 不会默认写入最终镜像。
 */
function appendBuildProxyArgs(buildArgs, proxy) {
  const pairs = [
    [
      'HTTP_PROXY',
      proxy.http,
    ],
    [
      'HTTPS_PROXY',
      proxy.https,
    ],
    [
      'ALL_PROXY',
      proxy.all,
    ],
    [
      'NO_PROXY',
      proxy.noProxy,
    ],
  ]

  for (const [name, value] of pairs) {
    if (!value)
      continue

    buildArgs.push(
      '--build-arg',
      `${name}=${value}`,

      '--build-arg',
      `${name.toLowerCase()}=${value}`,
    )
  }
}

/**
 * 将代理注入运行中的模型容器。
 */
function appendRunProxyEnvironment(runArgs, proxy) {
  const pairs = [
    [
      'HTTP_PROXY',
      proxy.http,
    ],
    [
      'HTTPS_PROXY',
      proxy.https,
    ],
    [
      'ALL_PROXY',
      proxy.all,
    ],
    [
      'NO_PROXY',
      proxy.noProxy,
    ],
  ]

  for (const [name, value] of pairs) {
    if (!value)
      continue

    appendEnvironment(
      runArgs,
      name,
      value,
    )

    appendEnvironment(
      runArgs,
      name.toLowerCase(),
      value,
    )
  }
}

// ─────────────────────────────────────────────────────────────
// 外部命令
// ─────────────────────────────────────────────────────────────

/**
 * 运行外部命令并透传 stdio。
 */
function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(
    command,
    commandArgs,
    {
      stdio: 'inherit',
      ...options,
    },
  )

  if (
    result.error
    && result.error.code === 'ENOENT'
  ) {
    throw new Error(
      `Command not found: ${command}. Please install it and retry.`,
    )
  }

  if (result.error)
    throw result.error

  if (
    typeof result.status === 'number'
    && result.status !== 0
  ) {
    throw new Error(
      `${command} exited with status ${result.status}`,
    )
  }
}

/**
 * 计算 Git blob SHA-1。
 */
function gitBlobSha(file) {
  const content = readFileSync(file)
  return createHash('sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex')
}

/**
 * 在宿主机准备固定版本的模型服务源码。
 *
 * Podman Desktop 运行在独立 VM 内；Windows 代理仅监听回环地址时，
 * 容器无法使用该代理。源码改由宿主机 curl 并行获取，每个文件按 Git blob 校验，
 * 再作为命名构建上下文传入，既复用宿主机代理，也支持中断后增量续传。
 */
function prepareSourceContext(manifest, proxy) {
  if (!manifest.source)
    return undefined

  const cacheDir = join(
    CACHE_DIR,
    'source-trees',
    manifest.name,
    manifest.source.revision,
  )
  const sourceDir = join(cacheDir, 'context')
  const treeFile = join(cacheDir, 'tree.json')
  const curlConfig = join(cacheDir, 'curl.conf')
  const completeFile = join(cacheDir, 'complete.json')
  const env = withProxyEnvironment(process.env, proxy)

  mkdirSync(sourceDir, { recursive: true })

  let completedTree
  try {
    completedTree = existsSync(completeFile)
      ? JSON.parse(readFileSync(completeFile, 'utf8')).tree
      : undefined
  }
  catch {
    completedTree = undefined
  }

  if (
    completedTree === manifest.source.tree
    && existsSync(join(sourceDir, 'indextts', 'infer_v2_5.py'))
  ) {
    console.log(`Using cached source ${sourceDir}`)
    return sourceDir
  }

  const treeUrl
    = `https://api.github.com/repos/${manifest.source.repository}`
      + `/git/trees/${manifest.source.tree}?recursive=1`

  runCommand(
    'curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '--location',
      '--retry',
      '5',
      '--retry-all-errors',
      '--output',
      treeFile,
      treeUrl,
    ],
    { env },
  )

  const tree = JSON.parse(readFileSync(treeFile, 'utf8'))
  if (tree.sha !== manifest.source.tree) {
    throw new Error(
      `Source tree mismatch for ${manifest.name}: `
      + `expected ${manifest.source.tree}, got ${tree.sha || 'unknown'}`,
    )
  }

  const rootFiles = new Set([
    'LICENSE',
    'MANIFEST.in',
    'README.md',
    'pyproject.toml',
    'uv.lock',
  ])
  const files = tree.tree.filter(entry =>
    entry.type === 'blob'
    && (
      rootFiles.has(entry.path)
      || entry.path.startsWith('indextts/')
    )
    && !entry.path.includes('/.ipynb_checkpoints/')
    // 该旧 MaskGCT 资源约 21 MiB，IndexTTS-2.5 推理链不加载它。
    && entry.path !== 'indextts/utils/maskgct/models/codec/facodec/modules/JDC/bst.t7',
  )

  const pending = []
  for (const entry of files) {
    const output = join(sourceDir, ...entry.path.split('/'))
    if (existsSync(output) && gitBlobSha(output) === entry.sha)
      continue

    mkdirSync(dirname(output), { recursive: true })
    const encodedPath = entry.path
      .split('/')
      .map(encodeURIComponent)
      .join('/')
    const url
      = `https://raw.githubusercontent.com/${manifest.source.repository}`
        + `/${manifest.source.revision}/${encodedPath}`
    pending.push(
      `url = "${url}"`,
      `output = "${output.replaceAll('\\', '/')}"`,
    )
  }

  if (pending.length > 0) {
    console.log(
      `Fetching ${pending.length / 2} source files `
      + `from ${manifest.source.repository}#${manifest.source.revision}`,
    )
    writeFileSync(curlConfig, `${pending.join('\n')}\n`, 'utf8')
    runCommand(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--location',
        '--retry',
        '5',
        '--retry-all-errors',
        '--parallel',
        '--parallel-max',
        '16',
        '--config',
        curlConfig,
      ],
      { env },
    )
  }

  const invalid = files.filter((entry) => {
    const file = join(sourceDir, ...entry.path.split('/'))
    return !existsSync(file) || gitBlobSha(file) !== entry.sha
  })
  if (invalid.length > 0) {
    throw new Error(
      `Source verification failed for ${manifest.name}: ${
        invalid.slice(0, 5).map(entry => entry.path).join(', ')}`,
    )
  }

  writeFileSync(
    completeFile,
    `${JSON.stringify({ tree: manifest.source.tree, files: files.length }, null, 2)}\n`,
    'utf8',
  )

  return sourceDir
}

// ─────────────────────────────────────────────────────────────
// Docker / Podman
// ─────────────────────────────────────────────────────────────

export const CONTAINER_ENGINES = [
  'podman',
  'docker',
]

/**
 * 解析容器引擎。
 *
 * auto：
 *   1. Podman
 *   2. Docker
 */
export function parseContainerEngine(args) {
  const fallback
    = process.env.HAI_CONTAINER_ENGINE
      || 'auto'

  const engine = parseFlag(
    args,
    '--engine',
    fallback,
  ).toLowerCase()

  if (
    engine !== 'auto'
    && !CONTAINER_ENGINES.includes(engine)
  ) {
    throw new Error(
      `Invalid --engine: ${engine} (expected auto | docker | podman)`,
    )
  }

  return engine
}

/**
 * 探测容器引擎。
 *
 * 不仅检查 CLI，
 * 同时检查后端 daemon / machine 是否可用。
 */
function probeContainerEngine(engine) {
  const result = spawnSync(
    engine,
    ['info'],
    {
      encoding: 'utf8',
      timeout: 15000,
    },
  )

  const missing
    = result.error?.code === 'ENOENT'

  return {
    engine,

    ready:
      !missing
      && !result.error
      && result.status === 0,

    missing,

    error:
      result.error,

    detail:
      (
        result.stderr
        || result.stdout
        || ''
      ).trim(),
  }
}

/**
 * 容器引擎异常提示。
 */
function formatEngineProblem(probe) {
  if (probe.missing)
    return `${probe.engine}: CLI not found`

  if (probe.error)
    return `${probe.engine}: ${probe.error.message}`

  const detail
    = probe.detail
      || `${probe.engine} info failed`

  if (probe.engine === 'docker') {
    return [
      'docker: engine unavailable;',
      'start Docker Desktop / Docker Engine.',
      detail,
    ].join(' ')
  }

  if (
    process.platform === 'win32'
    || process.platform === 'darwin'
  ) {
    return [
      'podman: engine unavailable;',
      'start the Podman machine',
      '(podman machine start).',
      detail,
    ].join(' ')
  }

  return `podman: engine unavailable. ${detail}`
}

/**
 * 选择容器引擎。
 *
 * auto 模式：
 *
 * Podman 可用 -> Podman；否则回退 Docker。
 */
function resolveContainerEngine(args) {
  const requested
    = parseContainerEngine(args)

  if (requested !== 'auto') {
    const probe
      = probeContainerEngine(requested)

    if (!probe.ready) {
      throw new Error(
        formatEngineProblem(probe),
      )
    }

    return requested
  }

  const probes
    = CONTAINER_ENGINES.map(
      probeContainerEngine,
    )

  const ready
    = probes.find(
      probe => probe.ready,
    )

  if (ready)
    return ready.engine

  throw new Error(
    `No usable container engine found.\n${probes
      .map(formatEngineProblem)
      .join('\n')
    }`,
  )
}

/**
 * Windows + Podman WSL：
 *
 * C:\xxx
 *
 * 转换为：
 *
 * /mnt/c/xxx
 */
function normalizeBindMountSource(engine, source) {
  if (
    engine !== 'podman'
    || process.platform !== 'win32'
  ) {
    return source
  }

  const machine = spawnSync(
    'podman',
    [
      'machine',
      'info',
      '--format',
      '{{.Host.VMType}}',
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
    },
  )

  if (
    machine.status !== 0
    || machine.stdout
      .trim()
      .toLowerCase() !== 'wsl'
  ) {
    return source
  }

  const match
    = /^([a-z]):[\\/](.*)$/i.exec(source)

  if (!match)
    return source

  const [
    ,
    drive,
    rest,
  ] = match

  return `/mnt/${drive.toLowerCase()
  }/${rest.replaceAll('\\', '/')
  }`
}

// ─────────────────────────────────────────────────────────────
// Container helpers
// ─────────────────────────────────────────────────────────────

/**
 * 权重目录存在且非空。
 */
function hasPreparedWeights(directory) {
  return existsSync(directory)
    && readdirSync(directory).length > 0
}

/**
 * 添加容器环境变量。
 */
function appendEnvironment(runArgs, name, value) {
  runArgs.push(
    '-e',
    `${name}=${value}`,
  )
}

// ─────────────────────────────────────────────────────────────
// list
// ─────────────────────────────────────────────────────────────

function cmdList() {
  const images = listImages()

  if (images.length === 0) {
    console.log('No model images found.')
    return
  }

  console.log('Model images:')

  for (const manifest of images) {
    console.log(
      `  ${manifest.name.padEnd(28)} `
      + `provides=${manifest.provides.join(',')} `
      + `protocol=${manifest.protocol} `
      + `devices=${manifest.devices.join('/')}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────
// inspect
// ─────────────────────────────────────────────────────────────

function cmdInspect(name) {
  requireName(
    name,
    'inspect',
  )

  const manifest
    = loadManifest(name)

  console.log(
    JSON.stringify(
      manifest,
      null,
      2,
    ),
  )
}

// ─────────────────────────────────────────────────────────────
// prepare
// ─────────────────────────────────────────────────────────────

function cmdPrepare(name, args) {
  requireName(
    name,
    'prepare',
  )

  const manifest
    = loadManifest(name)

  const imageDir
    = join(IMAGES_DIR, name)

  const outputDir
    = join(CACHE_DIR, name)

  const proxy
    = parseProxyConfig(args)

  console.log(
    `Preparing weights for ${manifest.name} -> ${outputDir}`,
  )

  runCommand(
    'python',
    ['prepare.py'],
    {
      cwd: imageDir,

      env: withProxyEnvironment(
        {
          ...process.env,
          HAI_MODEL_OUTPUT_DIR: outputDir,
        },
        proxy,
      ),
    },
  )
}

// ─────────────────────────────────────────────────────────────
// build
// ─────────────────────────────────────────────────────────────

function cmdBuild(name, args) {
  requireName(
    name,
    'build',
  )

  const manifest
    = loadManifest(name)

  const device
    = parseDevice(args)

  if (!manifest.devices.includes(device)) {
    throw new Error(
      `Model ${name} does not support device ${device}`,
    )
  }

  const bundleModel
    = args.includes('--bundle-model')

  const variant
    = bundleModel
      ? `${device}-bundled`
      : device

  const tag
    = `${manifest.image}:${manifest.version}-${variant}`

  const imageDir
    = join(IMAGES_DIR, name)

  /**
   * Dockerfile 中：
   *
   * cpu
   * gpu
   * cpu-bundled
   * gpu-bundled
   */
  const target
    = bundleModel
      ? `${device}-bundled`
      : device

  const engine
    = resolveContainerEngine(args)

  const proxy
    = parseProxyConfig(args)

  const containerProxy
    = containerProxyConfig(
      args,
      proxy,
      engine,
    )

  const sourceDir = prepareSourceContext(
    manifest,
    proxy,
  )

  /**
   * Docker:
   *
   * docker buildx build
   *
   * Podman:
   *
   * podman build
   */
  const buildArgs
    = engine === 'docker'
      ? [
          'buildx',
          'build',
          '--target',
          target,
          '-t',
          tag,
        ]
      : [
          'build',
          // 禁用 Podman 的隐式代理继承；代理仅由下方显式 build args 控制。
          '--http-proxy=false',
          '--target',
          target,
          '-t',
          tag,
        ]

  /**
   * Dockerfile RUN 阶段代理。
   */
  appendBuildProxyArgs(
    buildArgs,
    containerProxy,
  )

  if (args.includes('--no-cache'))
    buildArgs.push('--no-cache')

  if (sourceDir) {
    buildArgs.push(
      '--build-context',
      `hai_source=${sourceDir}`,
    )
  }

  if (bundleModel) {
    const modelDir
      = join(CACHE_DIR, name)

    if (!existsSync(modelDir)) {
      throw new Error(
        '--bundle-model requires prepared weights. '
        + `Run: node models/build.mjs prepare ${name}`,
      )
    }

    /**
     * Dockerfile:
     *
     * COPY --from=hai_model ...
     */
    buildArgs.push(
      '--build-context',
      `hai_model=${modelDir}`,
    )
  }

  /**
   * buildx 默认可能只保存在 builder cache，
   * 所以 Docker 显式 --load。
   *
   * Podman 不需要。
   */
  if (engine === 'docker')
    buildArgs.push('--load')

  buildArgs.push(imageDir)

  console.log(
    `Building ${tag} `
    + `(engine=${engine}, `
    + `device=${device}, `
    + `bundleModel=${bundleModel})`,
  )

  /**
   * CLI 自身网络请求也继承代理。
   *
   * 注意：
   * Docker Desktop daemon 自身拉取镜像时，
   * 是否使用这里的环境变量取决于 Docker Desktop 配置。
   */
  runCommand(
    engine,
    buildArgs,
    {
      env: withProxyEnvironment(
        process.env,
        proxy,
      ),
    },
  )
}

// ─────────────────────────────────────────────────────────────
// run
// ─────────────────────────────────────────────────────────────

async function cmdRun(name, args) {
  requireName(
    name,
    'run',
  )

  const manifest
    = loadManifest(name)

  const device
    = parseDevice(args)

  if (!manifest.devices.includes(device)) {
    throw new Error(
      `Model ${name} does not support device ${device}`,
    )
  }

  const hostPort
    = parsePortFlag(
      args,
      '--port',
      manifest.port,
    )

  const healthTimeoutMs
    = parsePositiveIntegerFlag(
      args,
      '--health-timeout',
      manifest.startupTimeout ?? 600000,
    )

  const bundled
    = args.includes('--bundled')

  const variant
    = bundled
      ? `${device}-bundled`
      : device

  const tag
    = `${manifest.image}:${manifest.version}-${variant}`

  const engine
    = resolveContainerEngine(args)

  const proxy
    = parseProxyConfig(args)

  const containerProxy
    = containerProxyConfig(
      args,
      proxy,
      engine,
    )

  const runArgs = [
    'run',
    '-p',
    `${hostPort}:${manifest.port}`,
  ]

  /**
   * Podman 默认会把宿主机代理环境自动注入容器。
   * Windows/macOS 的 Podman VM 无法访问宿主机 127.0.0.1，先关闭自动注入，
   * 再由下方显式写入经过校验的容器代理。
   */
  if (engine === 'podman') {
    runArgs.push('--http-proxy=false')
  }

  /**
   * 运行时容器代理。
   */
  appendRunProxyEnvironment(
    runArgs,
    containerProxy,
  )

  /**
   * GPU
   *
   * Docker / Podman 新版本均支持 --gpus。
   */
  if (device === 'gpu') {
    runArgs.push(
      '--gpus',
      'all',
    )
  }

  /**
   * qwen3 CPU 特殊运行参数。
   */
  if (
    name === 'qwen3-4b'
    && device === 'cpu'
  ) {
    runArgs.push(
      '--security-opt',
      'seccomp=unconfined',

      '--cap-add',
      'SYS_NICE',

      '--shm-size',
      '4g',
    )
  }

  const modelDir
    = join(CACHE_DIR, name)

  /**
   * 已 prepare：
   *
   * 直接挂载本地模型。
   */
  if (
    !bundled
    && hasPreparedWeights(modelDir)
  ) {
    const mountSource
      = normalizeBindMountSource(
        engine,
        modelDir,
      )

    runArgs.push(
      '-v',
      `${mountSource}:/opt/models`,
    )
  }

  /**
   * 未 prepare：
   *
   * 使用模型缓存 volume。
   */
  else if (
    !bundled
    && manifest.model
  ) {
    const modelscope = manifest.model.modelscope

    if (
      name === 'indextts-2.5'
      || name === 'faster-whisper-large-v3'
    ) {
      runArgs.push(
        '-v',
        `hai-model-${name}:/opt/models`,
      )

      appendEnvironment(
        runArgs,
        'MODEL_PATH',
        '/opt/models',
      )
    }
    else if (name === 'qwen3-4b') {
      runArgs.push(
        '-v',
        `hai-model-${name}:/root/.cache/modelscope`,
      )

      appendEnvironment(
        runArgs,
        'MODEL_PATH',
        modelscope?.id || manifest.model.id,
      )
    }

    appendEnvironment(
      runArgs,
      'HAI_MODEL_ID',
      manifest.model.id,
    )

    if (modelscope) {
      appendEnvironment(
        runArgs,
        'HAI_MODELSCOPE_ID',
        modelscope.id,
      )

      if (modelscope.revision) {
        appendEnvironment(
          runArgs,
          'HAI_MODELSCOPE_REVISION',
          modelscope.revision,
        )

        // vLLM 通过统一 revision 参数将固定版本透传给 ModelScope。
        appendEnvironment(
          runArgs,
          'HAI_MODEL_REVISION',
          modelscope.revision,
        )
      }
    }
    else if (manifest.model.revision) {
      appendEnvironment(
        runArgs,
        'HAI_MODEL_REVISION',
        manifest.model.revision,
      )
    }
  }

  runArgs.push(
    '-d',
    tag,
  )

  console.log(
    `Starting ${tag} `
    + `on port ${hostPort} `
    + `(engine=${engine})`,
  )

  const started = spawnSync(
    engine,
    runArgs,
    {
      encoding: 'utf8',

      env: withProxyEnvironment(
        process.env,
        proxy,
      ),
    },
  )

  if (
    started.error
    && started.error.code === 'ENOENT'
  ) {
    throw new Error(
      `Command not found: ${engine}. Please install it and retry.`,
    )
  }

  if (started.error)
    throw started.error

  if (started.status !== 0) {
    throw new Error(
      started.stderr
      || `${engine} run failed`,
    )
  }

  const containerId
    = started.stdout.trim()

  try {
    const healthUrl
      = `http://127.0.0.1:${hostPort}${manifest.health}`

    await waitForHealth(
      healthUrl,
      healthTimeoutMs,
      engine,
      containerId,
    )

    console.log(
      `Service healthy: ${healthUrl}`,
    )

    console.log(
      `Container: ${containerId}`,
    )
  }
  catch (error) {
    const logs = spawnSync(
      engine,
      ['logs', '--tail', '80', containerId],
      { encoding: 'utf8' },
    )

    spawnSync(
      engine,
      [
        'rm',
        '--force',
        containerId,
      ],
      {
        stdio: 'ignore',
      },
    )

    const detail = (logs.stderr || logs.stdout || '').trim()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(detail ? `${message}\nContainer logs:\n${detail}` : message)
  }
}

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────

async function waitForHealth(
  url,
  timeoutMs,
  engine,
  containerId,
  intervalMs = 2000,
) {
  const attempts
    = Math.max(
      1,
      Math.ceil(
        timeoutMs / intervalMs,
      ),
    )

  for (
    let i = 0;
    i < attempts;
    i++
  ) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.min(intervalMs, 5000)),
      })

      if (response.ok)
        return
    }
    catch {
      // 服务尚未就绪
    }

    const inspected = spawnSync(
      engine,
      [
        'inspect',
        '--format',
        '{{.State.Running}} {{.State.ExitCode}}',
        containerId,
      ],
      { encoding: 'utf8' },
    )

    if (inspected.status !== 0) {
      throw new Error(
        `Container disappeared before becoming healthy: ${containerId}`,
      )
    }

    const [running, exitCode] = inspected.stdout.trim().split(/\s+/)
    if (running !== 'true') {
      throw new Error(
        `Container exited before becoming healthy (exit code ${exitCode || 'unknown'}): ${containerId}`,
      )
    }

    await delay(intervalMs)
  }

  throw new Error(
    `Health check timed out: ${url}`,
  )
}

/** 延迟 */
function delay(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms),
  )
}

/** 要求模型名称 */
function requireName(name, command) {
  if (!name) {
    throw new Error(
      `Usage: node models/build.mjs ${command} <name>`,
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const [
    command,
    name,
    ...args
  ] = process.argv.slice(2)

  switch (command) {
    case 'list':
      cmdList()
      break

    case 'inspect':
      cmdInspect(name)
      break

    case 'prepare':
      cmdPrepare(
        name,
        args,
      )
      break

    case 'build':
      cmdBuild(
        name,
        args,
      )
      break

    case 'run':
      await cmdRun(
        name,
        args,
      )
      break

    default:
      console.log(
        'Usage: '
        + 'node models/build.mjs '
        + '<list|inspect|prepare|build|run> '
        + '[name] [options] '
        + '[--engine auto|docker|podman] '
        + '[--proxy <url>] '
        + '[--container-proxy <url>]',
      )

      if (command)
        process.exitCode = 1
  }
}

// 仅作为脚本直接执行时运行 CLI
if (
  process.argv[1]
  && fileURLToPath(import.meta.url)
  === process.argv[1]
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    )

    process.exitCode = 1
  })
}
