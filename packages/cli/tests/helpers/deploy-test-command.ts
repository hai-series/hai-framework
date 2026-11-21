/** 部署门禁的本地命令；实际执行期限保持十五分钟。 */
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { ownedGroups, signalOwned } from './startup-process.mjs'
import { windowsTestCommand, windowsTestJobProbe } from './startup-windows-job.js'

export interface DeployTestCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputBytes?: number
}

export class DeployTestCommandError extends Error {
  constructor(readonly reason: 'timeout' | 'abort' | 'output-limit' | 'spawn' | 'exit', readonly localTermination: 'confirmed' | 'unknown' | 'not-started', message: string, readonly exitCode?: number | null) {
    super(message)
  }
}

/** 辅助程序与实际树核验共享十秒预算；不接受 shell 命令串。 */
async function tool(command: string, args: string[], deadline: number): Promise<{ success: boolean, output: string }> {
  if (performance.now() >= deadline)
    return { success: false, output: '' }
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      child.unref()
      resolve({ success: false, output: '' })
    }, Math.max(1, deadline - performance.now()))
    child.stdout.on('data', (chunk: Buffer) => {
      output = (output + String(chunk)).slice(-1024 * 1024)
    })
    child.once('error', () => {
      clearTimeout(timer)
      resolve({ success: false, output: '' })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ success: code === 0, output })
    })
  })
}

/** 与普通启动复用会话核验；未知状态不能当作已经回收。 */
async function groupExited(pid: number): Promise<boolean> {
  try {
    return (await ownedGroups(pid)).length === 0
  }
  catch {
    return false
  }
}

export async function runDeployTestCommand(command: string, args: string[], options: DeployTestCommandOptions = {}): Promise<string> {
  if (options.signal?.aborted)
    throw new DeployTestCommandError('abort', 'not-started', 'Deployment command was cancelled before starting')
  const job = process.platform === 'win32'
    ? windowsTestCommand(command, args)
    : undefined
  const child = spawn(job ? 'powershell.exe' : command, job?.args ?? args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      ...job?.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  let stdout = ''
  let stderr = ''
  let bytes = 0
  let closed = false
  let spawnError: Error | undefined
  let reason: 'timeout' | 'abort' | 'output-limit' | 'exit' | undefined
  let stopping: Promise<'confirmed' | 'unknown'> | undefined
  let timer: NodeJS.Timeout | undefined
  let finishInterruption = () => {}
  const interrupted = new Promise<void>((resolve) => {
    finishInterruption = resolve
  })
  const completion = new Promise<number | null>((resolve) => {
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('close', (code) => {
      closed = true
      if (timer)
        clearTimeout(timer)
      resolve(code)
    })
  })
  const stop = (cause: 'timeout' | 'abort' | 'output-limit' | 'exit'): void => {
    if (stopping || (closed && job))
      return
    reason = cause
    stopping = (async () => {
      const deadline = performance.now() + 10_000
      const pid = child.pid
      if (!pid)
        return 'confirmed'
      let verified = true
      if (job) {
        // 使用本次 spawn 持有的原生进程句柄结束 Job owner，不按可复用 PID 查找或杀树。
        // owner 是唯一 Job 句柄持有者；关闭后由 KILL_ON_JOB_CLOSE 清空不可 breakaway 的成员。
        if (!closed)
          verified = child.kill('SIGKILL') || child.exitCode !== null
      }
      else {
        try {
          await signalOwned(pid, 'SIGKILL')
        }
        catch { verified = false }
      }
      while (performance.now() < deadline) {
        const treeStopped = job
          ? closed && (await tool('powershell.exe', windowsTestJobProbe(job.name), deadline)).success
          : await groupExited(pid)
        if (closed && treeStopped)
          return verified ? 'confirmed' : 'unknown'
        await delay(20)
      }
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
      return 'unknown'
    })()
    void stopping.then(finishInterruption)
  }
  // 根命令退出后立即检查，避免仍持有管道的后代阻止 close。
  child.once('exit', () => {
    if (!job && child.pid) {
      void groupExited(child.pid).then((empty) => {
        if (!empty)
          stop('exit')
      })
    }
  })
  const capture = (text: string, stream: 'stdout' | 'stderr'): void => {
    bytes += Buffer.byteLength(text)
    if (stream === 'stdout') {
      stdout = reason
        ? (stdout + text).slice(-6000)
        : stdout + text
    }
    else {
      stderr = reason
        ? (stderr + text).slice(-6000)
        : stderr + text
    }
    if (bytes > (options.maxOutputBytes ?? 16 * 1024 * 1024))
      stop('output-limit')
  }
  child.stdout.setEncoding('utf8').on('data', (text: string) => capture(text, 'stdout'))
  child.stderr.setEncoding('utf8').on('data', (text: string) => capture(text, 'stderr'))
  const abort = () => stop('abort')
  options.signal?.addEventListener('abort', abort, { once: true })
  timer = setTimeout(stop, options.timeoutMs ?? 900_000, 'timeout')
  if (options.signal?.aborted)
    abort()
  try {
    // stop 自身有界；不让未关闭的 stdio 无限阻止取消完成。
    await Promise.race([completion, interrupted])
    // POSIX 根进程退出不代表整个会话结束；Windows owner 在原生 Job 清空前不会正常返回。
    if (!stopping && child.pid && !job && !await groupExited(child.pid))
      stop('exit')
    const localTermination = stopping
      ? await stopping
      : child.pid ? 'confirmed' : 'not-started'
    if (reason || spawnError || child.exitCode !== 0)
      throw new DeployTestCommandError(reason ?? (spawnError ? 'spawn' : 'exit'), localTermination, `${command} ${args[0] ?? ''} failed: ${reason ?? spawnError?.message ?? `exit ${child.exitCode}`}\n${stdout.slice(-6000)}\n${stderr.slice(-6000)}`, child.exitCode)
    return stdout
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

/** 复用当前 pnpm 的真实入口；Windows Job 不能把 .cmd 当作原生程序启动。 */
export function runPnpmTestCommand(args: string[], options: DeployTestCommandOptions = {}): Promise<string> {
  const entry = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'npm_execpath')?.[1]
  if (!entry || !/(?:^|[/\\])pnpm(?:-native)?(?:\.exe|\.[cm]?js)?$/i.test(entry))
    throw new Error('Run CLI runtime tests through pnpm to preserve the package manager entrypoint')
  // 去掉 Vitest 自身的编译模式；应用模式仍由真实脚本和 dotenv 决定。
  const env = {
    ...process.env,
    ...options.env,
  }
  if (options.env?.NODE_ENV === undefined)
    delete env.NODE_ENV
  options = { ...options, env }
  return /\.[cm]?js$/i.test(entry)
    ? runDeployTestCommand(process.execPath, [entry, ...args], options)
    : runDeployTestCommand(entry, args, options)
}

export interface DeployTestCommands {
  signal: AbortSignal
  run: (command: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv) => Promise<string>
  close: () => Promise<void>
}

/** 总工作期限提前于 Vitest 结束，保留杀树核验与结算预算，不扩大外层 timeout。 */
export function createDeployTestCommands(options: { timeoutMs: number, cleanupReserveMs?: number, signal?: AbortSignal }): DeployTestCommands {
  const controller = new AbortController()
  const deadline = performance.now() + options.timeoutMs - (options.cleanupReserveMs ?? 20_000)
  const pending = new Set<Promise<string>>()
  const cleanupFailures: Error[] = []
  const timer = setTimeout(() => controller.abort(new Error('Deployment phase deadline exceeded')), Math.max(1, deadline - performance.now()))
  const cancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted)
    cancel()
  let closing: Promise<void> | undefined
  return {
    signal: controller.signal,
    async run(command, args, cwd, env) {
      if (performance.now() >= deadline)
        controller.abort(new Error('Deployment phase deadline exceeded'))
      controller.signal.throwIfAborted()
      const task = runDeployTestCommand(command, args, {
        cwd,
        env,
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.min(900_000, deadline - performance.now())),
      })
      pending.add(task)
      void task.then(() => pending.delete(task), (error: unknown) => {
        pending.delete(task)
        if (error instanceof DeployTestCommandError && error.localTermination === 'unknown')
          cleanupFailures.push(error)
      })
      return await task
    },
    close() {
      closing ??= (async () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', cancel)
        controller.abort(new Error('Deployment command scope closed'))
        await Promise.allSettled([...pending])
        if (cleanupFailures.length)
          throw new AggregateError(cleanupFailures, 'Deployment command tree exit was not confirmed')
      })()
      return closing
    },
  }
}
