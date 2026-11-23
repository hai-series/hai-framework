import type { HaiResult } from '@h-ai/core'
import type { RunnerConfig, RunnerEnvironment, RunnerResources } from './runner-config.js'
import type { RunnerSerializationJob } from './runner-serialization-worker.js'
import type { RunnerLaunch, RunnerProcess } from './runner-types.js'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, posix } from 'node:path'
import { promisify } from 'node:util'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { runnerM } from './runner-i18n.js'
import { HaiRunnerError } from './runner-types.js'
import { captureWorkspace, decodeWorkspace, maxWorkspaceBytes, maxWorkspaceFiles, parseWorkspaceSnapshot, workspaceSchema } from './runner-workspace.js'

const execute = promisify(execFile)
const containerId = /^[\da-f]{64}$/u
const envKey = /^[A-Z_]\w*$/iu
const MAX_FILE_BYTES = 50 * 1024 * 1024
const artifactName = /^[\da-z][\w.-]{0,127}$/iu
const fileName = /^[\w.][\w.-]{0,95}$/u
const argument = z.string().max(8192).refine(value => !value.includes('\0'))
const launchSchema = z.strictObject({
  command: argument.refine(value => value.length > 0 && !value.startsWith('-')),
  args: z.array(argument).max(128).default([]),
  env: z.record(z.string().regex(envKey), z.string().max(64_000).refine(value => !/[\r\n\0]/u.test(value))).default({}),
  files: z.record(z.string().regex(fileName).refine(value => value !== '.' && value !== '..'), z.string().max(128_000)).default({}),
  inputs: z.record(z.string().regex(artifactName), z.string().max(4 * Math.ceil(MAX_FILE_BYTES / 3))).optional(),
  workspace: workspaceSchema.optional(),
  cwd: z.string().max(1024).default('/workspace'),
})

const serializationPool = core.worker.createPool<RunnerSerializationJob, string | Record<string, string> | undefined>(
  new URL(import.meta.url.endsWith('.ts')
    ? '../dist/runner-serialization-worker.js'
    : './runner-serialization-worker.js', import.meta.url),
  { maxWorkers: 1, maxQueuedJobs: 4, idleTimeoutMs: 15_000 },
)
const workerThreshold = 256 * 1024

// 使用打开的文件描述符核对类型与大小，读取在容器内完成；不会解包归档或读取宿主路径。
const READ_ARTIFACT = `
import os, stat, sys
root = os.open('/output', os.O_DIRECTORY | os.O_NOFOLLOW)
fd = os.open(sys.argv[1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
limit = int(sys.argv[2])
meta = os.fstat(fd)
if not stat.S_ISREG(meta.st_mode) or meta.st_size > limit:
    raise SystemExit(2)
with os.fdopen(fd, 'rb') as item:
    remaining = limit + 1
    while remaining > 0:
        data = item.read(min(65536, remaining))
        if not data:
            break
        remaining -= len(data)
        if remaining == 0:
            raise SystemExit(2)
        sys.stdout.buffer.write(data)
`

async function cli(engine: RunnerConfig['engine'], args: string[]) {
  const result = await execute(engine, args, { timeout: 15_000, maxBuffer: 65_536, windowsHide: true })
  return result.stdout.trim()
}

function invalid() {
  return core.err(HaiRunnerError.INVALID, runnerM('runner_invalid'))
}

function unavailable() {
  return core.err(HaiRunnerError.UNAVAILABLE, runnerM('runner_unavailable'))
}

function uncertain() {
  return core.err(HaiRunnerError.CLEANUP_UNCONFIRMED, runnerM('runner_cleanupUnconfirmed'))
}

/**
 * 持久化的实际容器及暂存身份，用于原节点核验资源。
 * @example 模块内部上下文
 * ```ts
 * function engineName(record: RunnerContainerIdentity) { return record.engine }
 * ```
 */
export interface RunnerContainerIdentity {
  id: string
  engine: RunnerConfig['engine']
  engineKey: string
  stageName: string
  stageKey: string
}

const stageName = /^hai-runner-[a-z\d]{6}$/iu

async function stagingRoot() {
  const path = await realpath(tmpdir())
  const info = await stat(path, { bigint: true })
  return { path, key: `${path}:${info.dev}:${info.ino}` }
}

async function engineKey(engine: RunnerConfig['engine']) {
  const root = await stagingRoot()
  const host = (await readFile('/etc/machine-id', 'utf8')).trim()
  if (!/^[\da-f]{32}$/u.test(host))
    throw new Error('Host identity unavailable')
  const value = engine === 'podman'
    ? await cli(engine, ['info', '--format', '{{.Host.ServiceIsRemote}} {{.Store.GraphRoot}}'])
    : await cli(engine, ['info', '--format', '{{.ID}}'])
  if (engine === 'podman') {
    if (!value.startsWith('false '))
      throw new Error('Podman identity unavailable')
    const storage = await stat(value.slice(6), { bigint: true })
    return createHash('sha256').update(JSON.stringify([
      host,
      engine,
      root.key,
      value,
      String(storage.dev),
      String(storage.ino),
    ])).digest('hex')
  }
  if (!value || value === '<no value>')
    throw new Error('Docker identity unavailable')
  return createHash('sha256').update(JSON.stringify([host, engine, root.key, value])).digest('hex')
}

async function containerAbsent(engine: RunnerConfig['engine'], id: string) {
  return !(await cli(engine, [
    'container',
    'ls',
    '--all',
    '--no-trunc',
    '--filter',
    `id=${id}`,
    '--format',
    '{{.ID}}',
  ]))
}

async function identityOf(path: string) {
  const info = await lstat(path, { bigint: true })
  if (!info.isDirectory())
    throw new Error('Runner staging path is invalid')
  return `${info.dev}:${info.ino}`
}

/**
 * 仅在相同的真实引擎与暂存根上确认已停止，并清理已登记的专属暂存目录。
 * @example 模块内部上下文
 * ```ts
 * async function verify(record: RunnerContainerIdentity) { return confirmContainerReleased(record) }
 * ```
 */
export async function confirmContainerReleased(record: RunnerContainerIdentity): Promise<HaiResult<void>> {
  if (!containerId.test(record.id) || !stageName.test(record.stageName))
    return uncertain()
  try {
    if (record.engineKey !== await engineKey(record.engine) || !await containerAbsent(record.engine, record.id))
      return uncertain()
    const path = join((await stagingRoot()).path, record.stageName)
    let actual: string | undefined
    try {
      actual = await identityOf(path)
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        return uncertain()
    }
    if (actual) {
      if (actual !== record.stageKey)
        return uncertain()
      for (const name of ['input', 'configuration']) {
        const directory = join(path, name)
        try {
          if (!(await lstat(directory)).isDirectory())
            return uncertain()
          await chmod(directory, 0o700)
        }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
            return uncertain()
        }
      }
      await rm(path, { recursive: true, force: true })
    }
    return record.engineKey === await engineKey(record.engine) && await containerAbsent(record.engine, record.id)
      ? core.ok(undefined)
      : uncertain()
  }
  catch {
    return uncertain()
  }
}

/**
 * 单次预热的容器句柄只留在原执行节点。
 * @example 模块内部上下文
 * ```ts
 * function staged(handle: WarmContainer) { return handle.activate({ command: 'true', inputs: {} }, new AbortController().signal, async () => true) }
 * ```
 */
export interface WarmContainer extends RunnerProcess {
  activate: (launch: RunnerLaunch, signal: AbortSignal, authorize: () => Promise<boolean>) => Promise<HaiResult<RunnerProcess>>
}

const STANDBY = `
import json, os, sys
if os.listdir('/input') or os.listdir('/output'):
    raise SystemExit(2)
os.write(1, b'+')
if os.read(0, 1) != b'+':
    raise SystemExit(2)
with open('/run/hai-config/warm-launch.json', 'rb') as configuration:
    data = configuration.read(524289)
if len(data) > 524288:
    raise SystemExit(2)
command, *args = json.loads(data)
os.execvp(command, [command, *args])
`

function decodeInputs(inputs: Record<string, string>, resources: RunnerResources) {
  const budget = Math.min(MAX_FILE_BYTES, resources.scratchMiB * 1024 * 1024)
  const entries = Object.entries(inputs)
  if (entries.length > 8 || entries.reduce((total, [, value]) => total + value.length, 0) > 4 * Math.ceil(budget / 3) + 24)
    return undefined
  const decoded = entries.map(([name, value]) => ({
    name,
    value,
    bytes: Buffer.from(value, 'base64'),
  }))
  return decoded.some(item => item.bytes.toString('base64') !== item.value)
    || decoded.reduce((total, item) => total + item.bytes.length, 0) > budget
    ? undefined
    : decoded
}

/**
 * 运行已登记镜像中的单一进程，私有挂载和标准流由执行节点持有。
 * @example 模块内部上下文
 * ```ts
 * async function shell(config: RunnerConfig, environment: RunnerEnvironment) {
 *   return startContainer(config.engine, environment, environment.resources, { command: 'true' }, new AbortController().signal, async () => core.ok(undefined))
 * }
 * ```
 */
export async function startContainer(
  engine: RunnerConfig['engine'],
  environment: RunnerEnvironment,
  resources: RunnerResources,
  launch: RunnerLaunch,
  signal: AbortSignal,
  record: (identity: RunnerContainerIdentity) => Promise<HaiResult<void>>,
  warm = false,
): Promise<HaiResult<WarmContainer>> {
  const parsed = launchSchema.safeParse(launch)
  if (!parsed.success || signal.aborted)
    return invalid()
  const options = parsed.data
  const cwd = posix.normalize(options.cwd)
  if (cwd !== options.cwd || (cwd !== '/workspace' && !cwd.startsWith('/workspace/')) || cwd.includes('\0')
    || Object.keys(options.env).length > 128 || Object.keys(options.files).length > 32) {
    return invalid()
  }

  const decoded = options.inputs === undefined
    ? undefined
    : decodeInputs(options.inputs, resources)
  if (options.inputs && !decoded)
    return invalid()
  const workspaceMiB = Math.max(1, Math.floor(resources.scratchMiB / (decoded ? 8 : 2)))
  const workspaceBudget = Math.min(maxWorkspaceBytes, workspaceMiB * 1024 * 1024)
  const project = options.workspace === undefined
    ? undefined
    : decodeWorkspace(options.workspace, workspaceBudget)
  if ((options.workspace && !project) || (project && warm))
    return invalid()

  let temporary: string | undefined
  let id: string | undefined
  let envFile: string | undefined
  const readOnlyDirs: string[] = []
  let creationStarted = false

  async function removeContainer(container: string) {
    try {
      await cli(engine, [
        'container',
        'rm',
        '--force',
        '--volumes',
        ...(engine === 'podman'
          ? ['--time', '1']
          : []),
        container,
      ])
    }
    catch {
      // 查询引擎确认容器确实不在；单独收到 rm 失败不能推断已经停止。
    }
    try {
      return await containerAbsent(engine, container)
    }
    catch {
      return false
    }
  }

  async function removeFiles() {
    await Promise.all(readOnlyDirs.map(dir => chmod(dir, 0o700)))
    if (temporary)
      await rm(temporary, { recursive: true, force: true })
  }

  try {
    // 仅 Linux cgroup v2 上启用资源受管容器。
    const mode = engine === 'podman'
      ? await cli(engine, ['info', '--format', '{{.Host.CgroupsVersion}} {{join .Host.CgroupControllers ","}}'])
      : await cli(engine, ['info', '--format', '{{.OSType}} {{.CgroupVersion}} {{.CPUCfsQuota}} {{.MemoryLimit}} {{.PidsLimit}}'])
    if (engine === 'podman'
      ? !mode.startsWith('v2 ') || !['cpu', 'memory', 'pids'].every(name => mode.slice(3).split(',').includes(name))
      : mode !== 'linux 2 true true true') {
      return unavailable()
    }
    const imageVolumes = await cli(engine, [
      'image',
      'inspect',
      '--format',
      '{{json .Config.Volumes}}',
      environment.image,
    ])
    if (imageVolumes !== 'null' && imageVolumes !== '{}')
      return unavailable()

    if (environment.networkPolicy === 'internal') {
      const isolated = await cli(engine, [
        'network',
        'inspect',
        '--format',
        '{{.Internal}}',
        environment.network!,
      ])
      if (isolated !== 'true')
        return unavailable()
    }

    const key = await engineKey(engine)
    temporary = await mkdtemp(join((await stagingRoot()).path, 'hai-runner-'))
    envFile = join(temporary, 'environment')
    const files = join(temporary, 'configuration')
    await writeFile(envFile, Object.entries({
      HOME: '/state',
      XDG_CACHE_HOME: '/state/cache',
      XDG_CONFIG_HOME: '/state/config',
      TMPDIR: '/tmp',
      ...options.env,
    }).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600, flag: 'wx' })
    await mkdir(files)
    readOnlyDirs.push(files)
    await Promise.all(Object.entries(options.files).map(([name, content]) =>
      writeFile(join(files, name), content, { mode: 0o444, flag: 'wx' })))
    // 外层目录由节点账户私有持有；容器内 UID 可读挂入的目录。
    await chmod(files, 0o555)
    const inputDir = join(temporary, 'input')
    if (decoded) {
      await mkdir(inputDir)
      readOnlyDirs.push(inputDir)
      await Promise.all(decoded.map(item => writeFile(join(inputDir, item.name), item.bytes, { mode: 0o444, flag: 'wx' })))
      await chmod(inputDir, 0o555)
    }
    const projectDir = join(temporary, 'project')
    if (project) {
      await mkdir(projectDir)
      // 外层暂存由执行节点账户持有。容器通过独立只读挂载复制到限额内工作区。
      for (const file of project) {
        const target = join(projectDir, file.name)
        await mkdir(dirname(target), { recursive: true, mode: 0o755 })
        await writeFile(target, file.bytes, { mode: 0o644, flag: 'wx' })
      }
    }
    if (signal.aborted) {
      await removeFiles()
      return invalid()
    }

    const state = Math.max(1, Math.floor(resources.scratchMiB / 8))
    const output = decoded
      ? Math.max(1, Math.floor(resources.scratchMiB / 2))
      : 0
    const scratch = resources.scratchMiB - state - workspaceMiB - output
    if (scratch < 1) {
      await removeFiles()
      return invalid()
    }
    const mounts = [
      ['state', state],
      ['workspace', workspaceMiB],
      ['tmp', scratch],
      ...(decoded
        ? [
            ['output', output],
          ]
        : []),
    ].flatMap(([name, size]) => ['--tmpfs', `/${name}:rw,nosuid,nodev,mode=1777,size=${size}m`])

    creationStarted = true
    const created = await cli(engine, [
      'container',
      'create',
      '--pull=never',
      '--interactive',
      '--user=1000:1000',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--cgroupns=private',
      '--ipc=private',
      '--shm-size=1m',
      `--cpus=${resources.cpu}`,
      `--memory=${resources.memoryMiB}m`,
      `--memory-swap=${resources.memoryMiB}m`,
      `--pids-limit=${resources.pids}`,
      `--network=${environment.network ?? 'none'}`,
      ...(engine === 'podman'
        ? ['--read-only-tmpfs=false', '--http-proxy=false']
        : []),
      '--env-file',
      envFile,
      '--mount',
      `type=bind,source=${files},target=/run/hai-config,readonly`,
      ...mounts,
      ...(decoded
        ? ['--mount', `type=bind,source=${inputDir},target=/input,readonly`]
        : []),
      ...(project
        ? ['--mount', `type=bind,source=${projectDir},target=/run/hai-project,readonly`]
        : []),
      '--entrypoint=/bin/sh',
      environment.image,
      '-c',
      project
        ? 'cp -R /run/hai-project/. /workspace/ && cp -R /run/hai-config/. /state/ && cd "$1" && shift && exec "$@"'
        : 'cp -R /run/hai-config/. /state/ && cd "$1" && shift && exec "$@"',
      'hai-runner',
      cwd,
      options.command,
      ...options.args,
    ])
    if (!containerId.test(created))
      return uncertain()
    id = created
    await rm(envFile, { force: true })
    const receipt = await record({
      id,
      engine,
      engineKey: key,
      stageName: basename(temporary),
      stageKey: await identityOf(temporary),
    })
    if (signal.aborted || !receipt.success) {
      const stopped = await removeContainer(id)
      if (stopped)
        await removeFiles()
      if (!stopped)
        return uncertain()
      return receipt.success
        ? invalid()
        : receipt
    }

    const child = spawn(engine, [
      'container',
      'start',
      '--attach',
      '--interactive',
      id,
    ], { stdio: 'pipe', windowsHide: true })
    // 流可能在节点取消、收尾和用户观察之间关闭。错误由退出状态或 close 返回值呈现。
    child.stdin.on('error', () => {})
    const completion = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
      child.once('error', () => resolve({ code: null, signal: null }))
      child.once('close', (code, exited) => resolve({ code, signal: exited }))
    })
    let closing: Promise<HaiResult<void>> | undefined
    const stop = () => {
      closing ??= (async () => {
        if (!await removeContainer(created))
          return uncertain()
        child.kill()
        try {
          await removeFiles()
          return core.ok(undefined)
        }
        catch {
          return uncertain()
        }
      })()
      return closing
    }
    let activated = false
    const process: WarmContainer = {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      wait: () => completion,
      async activate(launch, activationSignal, authorize) {
        if (!warm || activated || closing || activationSignal.aborted)
          return invalid()
        activated = true
        const parsed = launchSchema.safeParse(launch)
        if (!parsed.success || parsed.data.workspace || parsed.data.cwd !== '/workspace' || Object.keys(parsed.data.env).length
          || Object.keys(parsed.data.files).length || !parsed.data.inputs) {
          return invalid()
        }
        const staged = decodeInputs(parsed.data.inputs, resources)
        const request = JSON.stringify([parsed.data.command, ...parsed.data.args])
        if (!staged || Buffer.byteLength(request) > 524288)
          return invalid()
        try {
          await chmod(inputDir, 0o755)
          await chmod(files, 0o755)
          // 所有写入结算后才允许移除容器或暂存；失败也不会重新分配给另一主体。
          const writes = await Promise.allSettled([
            ...staged.map(item => writeFile(join(inputDir, item.name), item.bytes, { mode: 0o444, flag: 'wx' })),
            writeFile(join(files, 'warm-launch.json'), request, { mode: 0o444, flag: 'wx' }),
          ])
          await chmod(inputDir, 0o555)
          await chmod(files, 0o555)
          if (writes.some(item => item.status === 'rejected') || !await authorize() || activationSignal.aborted || closing)
            return invalid()
          await new Promise<void>((resolve, reject) => {
            child.stdin.write('+', error => error
              ? reject(error)
              : resolve())
          })
          return core.ok(process)
        }
        catch {
          return unavailable()
        }
      },
      async artifact(name, maxBytes) {
        if (!decoded || closing || signal.aborted || !artifactName.test(name)
          || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_FILE_BYTES) {
          return invalid()
        }
        try {
          const { stdout } = await execute(engine, [
            'container',
            'exec',
            '--user=1000:1000',
            created,
            '/usr/bin/python3',
            '-I',
            '-S',
            '-c',
            READ_ARTIFACT,
            name,
            String(maxBytes),
          ], {
            encoding: 'buffer',
            timeout: 15_000,
            maxBuffer: maxBytes,
            windowsHide: true,
            signal,
          })
          if (stdout.length > maxBytes)
            return invalid()
          if (stdout.length < workerThreshold)
            return core.ok(stdout.toString('base64'))
          const bytes = new Uint8Array(stdout)
          const encoded = await serializationPool.run({ type: 'artifact', bytes }, [bytes.buffer])
          return encoded.success && typeof encoded.data === 'string' && !closing && !signal.aborted
            ? core.ok(encoded.data)
            : invalid()
        }
        catch {
          return invalid()
        }
      },
      async snapshot(maxBytes) {
        if (!project || closing || signal.aborted || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > workspaceBudget)
          return invalid()
        try {
          const { stdout } = await execute(engine, [
            'container',
            'exec',
            '--user=1000:1000',
            '--env=NODE_OPTIONS=',
            '--env=NODE_PATH=',
            created,
            'node',
            '--input-type=commonjs',
            '-e',
            captureWorkspace,
            String(maxBytes),
            String(maxWorkspaceFiles),
          ], {
            timeout: 15_000,
            maxBuffer: 4 * Math.ceil(maxBytes / 3) + maxWorkspaceFiles * 2100,
            windowsHide: true,
            signal,
          })
          if (stdout.length < workerThreshold) {
            const files = parseWorkspaceSnapshot(stdout, maxBytes)
            return files
              ? core.ok(files)
              : invalid()
          }
          const files = await serializationPool.run({ type: 'snapshot', content: stdout, budget: maxBytes })
          return files.success && files.data && typeof files.data !== 'string' && !closing && !signal.aborted
            ? core.ok(files.data)
            : invalid()
        }
        catch {
          return invalid()
        }
      },
      close: stop,
    }
    if (warm) {
      const readySignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(15_000),
      ])
      try {
        const [chunk] = await once(child.stdout, 'data', { signal: readySignal })
        child.stdout.pause()
        if (!Buffer.isBuffer(chunk) || chunk.length !== 1 || chunk[0] !== 43)
          throw new Error('Invalid warm readiness')
      }
      catch {
        return (await stop()).success
          ? unavailable()
          : uncertain()
      }
    }
    return core.ok(process)
  }
  catch {
    if (envFile) {
      try {
        await rm(envFile, { force: true })
      }
      catch {
        // 继续清理容器，随后再核对临时目录。
      }
    }
    if (id && await removeContainer(id))
      creationStarted = false
    if (!creationStarted) {
      try {
        await removeFiles()
      }
      catch {
        return uncertain()
      }
    }
    return creationStarted
      ? uncertain()
      : unavailable()
  }
}

/**
 * 启动完全无用户输入的单次候选容器，等待固定协议就绪。
 * @example 模块内部上下文
 * ```ts
 * function prepare(settings: RunnerConfig, environment: RunnerEnvironment) {
 *   return prepareWarmContainer(settings.engine, environment, new AbortController().signal, async () => core.ok(undefined))
 * }
 * ```
 */
export async function prepareWarmContainer(
  engine: RunnerConfig['engine'],
  environment: RunnerEnvironment,
  signal: AbortSignal,
  record: (identity: RunnerContainerIdentity) => Promise<HaiResult<void>>,
) {
  if (environment.networkPolicy !== 'offline')
    return invalid()
  return startContainer(engine, environment, environment.resources, {
    command: '/usr/bin/python3',
    args: ['-I', '-S', '-c', STANDBY],
    inputs: {},
  }, signal, record, true)
}
