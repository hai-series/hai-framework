import type { HaiResult } from '@h-ai/core'
import type { RunnerConfig, RunnerEnvironment, RunnerResources } from './runner-config.js'
import type { RunnerLaunch, RunnerProcess } from './runner-types.js'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, posix } from 'node:path'
import { promisify } from 'node:util'
import { err, ok } from '@h-ai/core'
import { z } from 'zod'
import { runnerM } from './runner-i18n.js'
import { HaiRunnerError } from './runner-types.js'

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
  cwd: z.string().max(1024).default('/workspace'),
})

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
  return err(HaiRunnerError.INVALID, runnerM('runner_invalid'))
}

function unavailable() {
  return err(HaiRunnerError.UNAVAILABLE, runnerM('runner_unavailable'))
}

function uncertain() {
  return err(HaiRunnerError.CLEANUP_UNCONFIRMED, runnerM('runner_cleanupUnconfirmed'))
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
      ? ok(undefined)
      : uncertain()
  }
  catch {
    return uncertain()
  }
}

/**
 * 运行已登记镜像中的单一进程，私有挂载和标准流由执行节点持有。
 * @example 模块内部上下文
 * ```ts
 * async function shell(config: RunnerConfig, environment: RunnerEnvironment) {
 *   return startContainer(config.engine, environment, environment.resources, { command: 'true' }, new AbortController().signal, async () => ok(undefined))
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
): Promise<HaiResult<RunnerProcess>> {
  const parsed = launchSchema.safeParse(launch)
  if (!parsed.success || signal.aborted)
    return invalid()
  const options = parsed.data
  const cwd = posix.normalize(options.cwd)
  if (cwd !== options.cwd || (cwd !== '/workspace' && !cwd.startsWith('/workspace/')) || cwd.includes('\0')
    || Object.keys(options.env).length > 128 || Object.keys(options.files).length > 32) {
    return invalid()
  }

  const inputs = options.inputs === undefined
    ? undefined
    : Object.entries(options.inputs)
  const inputBudget = Math.min(MAX_FILE_BYTES, resources.scratchMiB * 1024 * 1024)
  if (inputs && (inputs.length > 8 || inputs.reduce((total, [, value]) => total + value.length, 0) > 4 * Math.ceil(inputBudget / 3) + 24))
    return invalid()
  const decoded = inputs?.map(([name, value]) => ({
    name,
    value,
    bytes: Buffer.from(value, 'base64'),
  }))
  if (decoded && (decoded.some(item => item.bytes.toString('base64') !== item.value)
    || decoded.reduce((total, item) => total + item.bytes.length, 0) > inputBudget)) {
    return invalid()
  }

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
    if (signal.aborted) {
      await removeFiles()
      return invalid()
    }

    const state = Math.max(1, Math.floor(resources.scratchMiB / 8))
    const workspace = Math.max(1, Math.floor(resources.scratchMiB / (decoded ? 8 : 2)))
    const output = decoded
      ? Math.max(1, Math.floor(resources.scratchMiB / 2))
      : 0
    const scratch = resources.scratchMiB - state - workspace - output
    if (scratch < 1) {
      await removeFiles()
      return invalid()
    }
    const mounts = [
      ['state', state],
      ['workspace', workspace],
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
      '--entrypoint=/bin/sh',
      environment.image,
      '-c',
      'cp -R /run/hai-config/. /state/ && cd "$1" && shift && exec "$@"',
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
          return ok(undefined)
        }
        catch {
          return uncertain()
        }
      })()
      return closing
    }
    return ok({
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      wait: () => completion,
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
          return stdout.length <= maxBytes
            ? ok(stdout.toString('base64'))
            : invalid()
        }
        catch {
          return invalid()
        }
      },
      close: stop,
    })
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
