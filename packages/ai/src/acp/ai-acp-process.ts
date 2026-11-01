import type { ChildProcess } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { ACPFailure } from './ai-acp-errors.js'
import { windowsACPJobProbe } from './ai-acp-process-windows.js'

/** 探测只返回退出码，不捕获私有参数；超过剩余期限按未确认处理。 */
async function jobProbe(name: string, timeout: number): Promise<number> {
  return new Promise((resolve) => {
    const probe = spawn('powershell.exe', windowsACPJobProbe(name), { shell: false, windowsHide: true, stdio: 'ignore', env: baseEnvironment() })
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      resolve(code)
    }
    timer = setTimeout(() => {
      // 仅停止本次查询 helper；未知结果不能释放 Agent 的资源占用。
      void stopProcess(probe).catch(() => {}).finally(() => finish(2))
      probe.kill('SIGKILL')
      finish(2)
    }, Math.max(1, timeout))
    probe.once('error', () => finish(2))
    probe.once('close', code => finish(code ?? 2))
  })
}

/** 终止拥有的 Job helper 后核验真实 Job 归零，不依赖中间进程的父子关系。 */
async function stopWindowsJob(child: ChildProcess, name: string, closeObserved?: boolean): Promise<void> {
  const deadline = performance.now() + 15000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      stopProcess(child, { closeObserved }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new ACPFailure('cleanup'))
        }, Math.max(1, deadline - performance.now()))
      }),
    ])
    while (performance.now() < deadline) {
      const state = await jobProbe(name, deadline - performance.now())
      if (state === 0)
        return
      if (state !== 1)
        throw new ACPFailure('cleanup')
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new ACPFailure('cleanup')
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * 只停止本次创建的进程树；等待 close 后才允许释放目录占用。
 * @param child - 本模块以独立进程组启动的子进程。
 * @param options - ownedTree 用于长期 ACP 进程；closeObserved 表示已观察到 close 事件，避免重复等待。
 * @param options.ownedTree - 长期 Agent 清理必须核验其后台进程树。
 * @param options.closeObserved - 调用方已观察到主进程 close 事件。
 * @param options.windowsJob - Windows ACP 启动时创建的私有 Job 名；关闭后必须确认无成员。
 * @returns 进程树终止并关闭管道后的 Promise。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function cleanup(child: ChildProcess) { await stopProcess(child) }
 * ```
 */
export async function stopProcess(
  child: ChildProcess,
  options: { ownedTree?: boolean, closeObserved?: boolean, windowsJob?: string } = {},
): Promise<void> {
  if (process.platform === 'win32' && options.windowsJob)
    return stopWindowsJob(child, options.windowsJob, options.closeObserved)
  const exited = child.exitCode !== null || child.signalCode !== null
  if (!child.pid || (exited && !options.ownedTree))
    return
  // 长期 Agent 的主进程退出不等于后台工具停止；POSIX 仍需清理拥有的进程组。
  if (process.platform === 'win32' && exited && options.ownedTree)
    throw new ACPFailure('cleanup')
  const closed = options.closeObserved
    ? Promise.resolve()
    : new Promise<void>(resolve => child.once('close', () => resolve()))
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' },
      )
      killer.once('error', reject)
      killer.once('exit', code =>
        code === 0 || (!options.ownedTree && child.exitCode !== null)
          ? resolve()
          : reject(new ACPFailure('cleanup')))
    })
  }
  else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
        throw new ACPFailure('cleanup')
    }
  }
  await closed
}

/**
 * 子进程不默认继承应用的数据库、云服务等密钥。
 * @returns 不含应用服务凭据的最小环境变量副本。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const variables = Object.keys(baseEnvironment())
 * ```
 */
export function baseEnvironment(): Record<string, string> {
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined
      && /^(?:path|pathext|systemroot|windir|comspec|temp|tmp|lang|lc_all|ssl_cert_file|node_extra_ca_certs)$/i.test(
        key,
      )
    ) {
      output[key] = value
    }
  }
  return output
}

/**
 * 容器客户端读取连接配置需要宿主目录；这些值不注入 Agent 容器。
 * @returns 含宿主连接配置路径的容器客户端环境。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const engineVariables = Object.keys(engineEnvironment())
 * ```
 */
export function engineEnvironment(): Record<string, string> {
  const output = baseEnvironment()
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined
      && /^(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|XDG_CONFIG_HOME|XDG_RUNTIME_DIR|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|CONTAINER_HOST|CONTAINER_CONNECTION|SSH_AUTH_SOCK)$/i.test(
        key,
      )
    ) {
      output[key] = value
    }
  }
  return output
}

/**
 * 有界执行命令；stderr 不进入公开错误或日志。
 * @param command - 可执行文件名或路径，不经 shell。
 * @param args - 独立参数数组。
 * @param cwd - 可选工作目录。
 * @param env - 明确允许传入的额外环境变量。
 * @param timeout - 毫秒超时，默认 120000。
 * @returns 去除首尾空白的 stdout；非零退出、超时或输出超限时抛错。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function gitVersion() { return execute('git', ['--version']) }
 * ```
 */
export async function execute(
  command: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  timeout = 120000,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...(command === 'podman' || command === 'docker'
          ? engineEnvironment()
          : baseEnvironment()),
        ...env,
      },
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let failure: unknown
    const stop = (error: unknown) => {
      failure ??= error
      void stopProcess(child).catch((error) => {
        failure = error
      })
    }
    const timer = setTimeout(() => stop(new ACPFailure('timeout')), timeout)
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (Buffer.byteLength(output) > 8 * 1024 * 1024)
        stop(new ACPFailure('output'))
    })
    child.stderr.resume()
    child.once('error', (error: NodeJS.ErrnoException) => {
      failure = new ACPFailure(
        command === 'git' && error.code === 'ENOENT' ? 'gitMissing' : 'runtime',
      )
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (failure)
        reject(failure)
      else if (code !== 0)
        reject(new ACPFailure('failed', { exitCode: code }))
      else resolve(output.trim())
    })
  })
}
