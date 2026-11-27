import type { HaiResult } from '@h-ai/core'
import type { RunnerConfig, RunnerEnvironment, RunnerResources } from './runner-config.js'
import type { RunnerSerializationJob } from './runner-serialization-worker.js'
import type { RunnerLaunch, RunnerProcess } from './runner-types.js'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, posix } from 'node:path'
import { promisify } from 'node:util'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { runnerM } from './runner-i18n.js'
import { HaiRunnerError } from './runner-types.js'
import { captureWorkspace, decodeWorkspace, maxWorkspaceBytes, maxWorkspaceFiles, parseWorkspaceSnapshot, workspacePath, workspaceSchema } from './runner-workspace.js'

const execute = promisify(execFile)
const containerId = /^[\da-f]{64}$/u
const attemptLabel = 'hai.runner.attempt'
const containerIdFile = 'container-id'
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
  workspaceExecutables: z.array(z.string().refine(workspacePath)).max(maxWorkspaceFiles).optional(),
  cwd: z.string().max(1024).default('/workspace'),
}).refine(({ workspace, workspaceExecutables }) => workspaceExecutables === undefined
  || (workspace !== undefined && new Set(workspaceExecutables).size === workspaceExecutables.length
    && workspaceExecutables.every(path => Object.hasOwn(workspace, path))))

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
 * 持久化的创建尝试或实际容器身份，用于原节点核验资源。
 * @example 模块内部上下文
 * ```ts
 * function engineName(record: RunnerContainerIdentity) { return record.engine }
 * ```
 */
export interface RunnerContainerIdentity {
  id?: string
  attempt?: string
  engine: RunnerConfig['engine']
  engineKey: string
  stageName: string
  stageKey: string
}

/**
 * 持久化创建凭据。补记完整 ID 时传入此前已记录的尝试作为写入条件。
 * @example 模块内部上下文
 * ```ts
 * async function recordAttempt(save: RecordContainer, attempt: RunnerContainerIdentity) { return save(attempt) }
 * ```
 */
type RecordContainer = (identity: RunnerContainerIdentity, previous?: RunnerContainerIdentity) => Promise<HaiResult<void>>

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

async function containerAbsent(engine: RunnerConfig['engine'], filter: string) {
  return !(await cli(engine, [
    'container',
    'ls',
    '--all',
    '--no-trunc',
    '--filter',
    filter,
    '--format',
    '{{.ID}}',
  ]))
}

async function stagedContainerId(directory: string) {
  try {
    const file = await open(join(directory, containerIdFile), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > 65)
        return undefined
      const data = Buffer.alloc(66)
      const { bytesRead } = await file.read(data)
      const id = data.subarray(0, bytesRead).toString('utf8').trim()
      return containerId.test(id)
        ? id
        : undefined
    }
    finally {
      await file.close()
    }
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined
    throw error
  }
}

function createRejected(error: unknown, engine: RunnerConfig['engine']) {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'number' || error.code === 0
    || ('signal' in error && error.signal) || ('killed' in error && error.killed)) {
    return false
  }
  // 本地 Podman 在 CLI 进程内完成创建；Docker 需取得守护进程已返回错误的凭据。
  return engine === 'podman'
    || ('stderr' in error && typeof error.stderr === 'string' && /^Error response from daemon:/mu.test(error.stderr))
}

async function identityOf(path: string) {
  const info = await lstat(path, { bigint: true })
  if (!info.isDirectory())
    throw new Error('Runner staging path is invalid')
  return `${info.dev}:${info.ino}`
}

async function writeStagedFile(path: string, content: string | Uint8Array, mode: number) {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(content)
    // 容器 UID 可能不同于宿主文件所有者，挂载文件的权限不由进程 umask 决定。
    await file.chmod(mode)
  }
  finally {
    await file.close()
  }
}

async function allStagedFilesWritten(writes: Promise<void>[]) {
  return (await Promise.allSettled(writes)).every(result => result.status === 'fulfilled')
}

/**
 * 仅在相同的真实引擎与暂存根上确认已停止，并清理已登记的专属暂存目录。
 * @example 模块内部上下文
 * ```ts
 * async function verify(record: RunnerContainerIdentity) { return confirmContainerReleased(record) }
 * ```
 */
export async function confirmContainerReleased(record: RunnerContainerIdentity, attemptCompleted = false): Promise<HaiResult<void>> {
  if ((!record.id && !record.attempt) || (record.id !== undefined && !containerId.test(record.id))
    || (record.attempt !== undefined && !containerId.test(record.attempt)) || !stageName.test(record.stageName)) {
    return uncertain()
  }
  try {
    if (record.engineKey !== await engineKey(record.engine))
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
    if (actual && actual !== record.stageKey)
      return uncertain()
    const id = record.id ?? (actual
      ? await stagedContainerId(path)
      : undefined)
    if (!id && !attemptCompleted)
      return uncertain()
    async function released() {
      return (!id || await containerAbsent(record.engine, `id=${id}`))
        && (!record.attempt || await containerAbsent(record.engine, `label=${attemptLabel}=${record.attempt}`))
    }
    if (!await released())
      return uncertain()
    if (actual) {
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
    return record.engineKey === await engineKey(record.engine) && await released()
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
  record: RecordContainer,
  warm = false,
): Promise<HaiResult<WarmContainer>> {
  const parsed = launchSchema.safeParse(launch)
  if (!parsed.success || signal.aborted)
    return invalid()
  const options = parsed.data
  if (resources.pids < 2 || (options.inputs !== undefined && resources.scratchMiB < 4))
    return invalid()
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
  const executablePaths = new Set(options.workspaceExecutables)

  let temporary: string | undefined
  let id: string | undefined
  let envFile: string | undefined
  let attempt: RunnerContainerIdentity | undefined
  const readOnlyDirs: string[] = []
  let creationStarted = false
  let conflictingIds = false

  async function removeContainer(container: string) {
    try {
      if (!attempt || attempt.engineKey !== await engineKey(engine))
        return false
    }
    catch {
      return false
    }
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
      return await containerAbsent(engine, `id=${container}`)
        && await containerAbsent(engine, `label=${attemptLabel}=${attempt.attempt}`)
        && attempt.engineKey === await engineKey(engine)
    }
    catch {
      return false
    }
  }

  async function removeFiles() {
    for (const directory of readOnlyDirs) {
      try {
        await chmod(directory, 0o700)
      }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
          throw error
      }
    }
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
    await chmod(temporary, 0o700)
    attempt = {
      attempt: randomBytes(32).toString('hex'),
      engine,
      engineKey: key,
      stageName: basename(temporary),
      stageKey: await identityOf(temporary),
    }
    const recorded = await record(attempt)
    if (!recorded.success || signal.aborted) {
      await removeFiles()
      return recorded.success
        ? invalid()
        : recorded
    }
    envFile = join(temporary, 'environment')
    const files = join(temporary, 'configuration')
    await writeStagedFile(envFile, Object.entries({
      HOME: '/state',
      XDG_CACHE_HOME: '/state/cache',
      XDG_CONFIG_HOME: '/state/config',
      TMPDIR: '/tmp',
      ...options.env,
    }).map(([key, value]) => `${key}=${value}`).join('\n'), 0o600)
    await mkdir(files)
    readOnlyDirs.push(files)
    await chmod(files, 0o700)
    if (!await allStagedFilesWritten(Object.entries(options.files).map(([name, content]) =>
      writeStagedFile(join(files, name), content, 0o444)))) {
      throw new Error('Runner configuration files could not be staged')
    }
    // 外层目录由节点账户私有持有；容器内 UID 可读挂入的目录。
    await chmod(files, 0o555)
    const inputDir = join(temporary, 'input')
    if (decoded) {
      await mkdir(inputDir)
      readOnlyDirs.push(inputDir)
      await chmod(inputDir, 0o700)
      if (!await allStagedFilesWritten(decoded.map(item => writeStagedFile(join(inputDir, item.name), item.bytes, 0o444))))
        throw new Error('Runner input files could not be staged')
      await chmod(inputDir, 0o555)
    }
    const projectDir = join(temporary, 'project')
    if (project) {
      await mkdir(projectDir)
      await chmod(projectDir, 0o755)
      const directories = new Set<string>()
      // 外层暂存由执行节点账户持有。容器通过独立只读挂载复制到限额内工作区。
      for (const file of project) {
        let directory = projectDir
        for (const part of file.name.split('/').slice(0, -1)) {
          directory = join(directory, part)
          if (!directories.has(directory)) {
            await mkdir(directory)
            await chmod(directory, 0o755)
            directories.add(directory)
          }
        }
        await writeStagedFile(join(projectDir, file.name), file.bytes, executablePaths.has(file.name)
          ? 0o755
          : 0o644)
      }
    }
    if (signal.aborted) {
      await removeFiles()
      return invalid()
    }

    const state = Math.max(1, Math.floor(resources.scratchMiB / 8))
    const output = decoded
      ? Math.min(Math.floor(resources.scratchMiB / 2), resources.scratchMiB - state - workspaceMiB - 1)
      : 0
    const scratch = resources.scratchMiB - state - workspaceMiB - output
    const mounts = [
      ['state', state],
      ['workspace', workspaceMiB],
      ['tmp', scratch],
      ...(decoded
        ? [
            ['output', output],
          ]
        : []),
    ].flatMap(([name, size]) => {
      const execution = name === 'workspace' && executablePaths.size > 0
        ? ',exec'
        : ''
      return ['--tmpfs', `/${name}:rw,nosuid,nodev,mode=1777,size=${size}m${execution}`]
    })

    const create = [
      'container',
      'create',
      '--cidfile',
      join(temporary, containerIdFile),
      '--label',
      `${attemptLabel}=${attempt.attempt}`,
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
        ? '(umask 022 && exec cp -R /run/hai-project/. /workspace/) && cp -R /run/hai-config/. /state/ && cd "$1" && shift && exec "$@"'
        : 'cp -R /run/hai-config/. /state/ && cd "$1" && shift && exec "$@"',
      'hai-runner',
      cwd,
      options.command,
      ...options.args,
    ]
    creationStarted = true
    let created: string
    try {
      created = await cli(engine, create)
    }
    catch (error) {
      const notStarted = error instanceof Error && 'syscall' in error && error.syscall === `spawn ${engine}`
      if (notStarted || (createRejected(error, engine) && (await confirmContainerReleased(attempt, true)).success))
        creationStarted = false
      throw error
    }
    if (!containerId.test(created))
      throw new Error('Container engine did not return a full ID')
    const cid = await stagedContainerId(temporary)
    if (cid && cid !== created) {
      conflictingIds = true
      throw new Error('Container engine returned inconsistent IDs')
    }
    id = created
    await rm(envFile, { force: true })
    const receipt = await record({ ...attempt, id }, attempt)
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
    let stopRequested = false
    let stopping: Promise<HaiResult<void>> | undefined
    const stop = () => {
      stopRequested = true
      stopping ??= (async () => {
        if (!await removeContainer(created))
          return uncertain()
        try {
          child.kill()
          await removeFiles()
          return core.ok(undefined)
        }
        catch {
          return uncertain()
        }
      })().then((result) => {
        if (!result.success)
          stopping = undefined
        return result
      })
      return stopping
    }
    let activated = false
    const process: WarmContainer = {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      wait: () => completion,
      async activate(launch, activationSignal, authorize) {
        if (!warm || activated || stopRequested || activationSignal.aborted)
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
          const written = await allStagedFilesWritten([
            ...staged.map(item => writeStagedFile(join(inputDir, item.name), item.bytes, 0o444)),
            writeStagedFile(join(files, 'warm-launch.json'), request, 0o444),
          ])
          await chmod(inputDir, 0o555)
          await chmod(files, 0o555)
          if (!written || !await authorize() || activationSignal.aborted || stopRequested)
            return invalid()
          await new Promise<void>((resolve, reject) => {
            child.stdin.write('+', error => error
              ? reject(error)
              : resolve())
          })
          return stopRequested || activationSignal.aborted
            ? invalid()
            : core.ok(process)
        }
        catch {
          return unavailable()
        }
      },
      async artifact(name, maxBytes) {
        if (!decoded || stopRequested || signal.aborted || !artifactName.test(name)
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
          if (stopRequested || signal.aborted || stdout.length > maxBytes)
            return invalid()
          if (stdout.length < workerThreshold)
            return core.ok(stdout.toString('base64'))
          const bytes = new Uint8Array(stdout)
          const encoded = await serializationPool.run({ type: 'artifact', bytes }, [bytes.buffer])
          return encoded.success && typeof encoded.data === 'string' && !stopRequested && !signal.aborted
            ? core.ok(encoded.data)
            : invalid()
        }
        catch {
          return invalid()
        }
      },
      async snapshot(maxBytes) {
        if (!project || stopRequested || signal.aborted || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > workspaceBudget)
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
          if (stopRequested || signal.aborted)
            return invalid()
          if (stdout.length < workerThreshold) {
            const files = parseWorkspaceSnapshot(stdout, maxBytes)
            return files
              ? core.ok(files)
              : invalid()
          }
          const files = await serializationPool.run({ type: 'snapshot', content: stdout, budget: maxBytes })
          return files.success && files.data && typeof files.data !== 'string' && !stopRequested && !signal.aborted
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
    if (creationStarted && !conflictingIds) {
      try {
        id ??= temporary
          ? await stagedContainerId(temporary)
          : undefined
        if (id && await removeContainer(id))
          creationStarted = false
      }
      catch {
        // 创建请求的结果不明确时，保留已登记的尝试与暂存区供原节点核验。
      }
    }
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
  record: RecordContainer,
) {
  if (environment.networkPolicy !== 'offline')
    return invalid()
  return startContainer(engine, environment, environment.resources, {
    command: '/usr/bin/python3',
    args: ['-I', '-S', '-c', STANDBY],
    inputs: {},
  }, signal, record, true)
}
