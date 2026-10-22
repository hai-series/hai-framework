/** 管理命令的真实本地进程树；POSIX 使用独立进程组，Windows 使用不可 breakaway 的 Job。 */
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { windowsCommand, windowsJobProbe } from './deploy-command-windows.js'

/** Linux 的孤儿 zombie 已退出，不能把未回收的 PID 当作仍执行的进程。 */
async function groupExited(pid: number): Promise<boolean> {
  try {
    process.kill(-pid, 0)
  }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH'
  }
  if (process.platform !== 'linux')
    return false
  try {
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry))
        continue
      let stat: string
      try {
        stat = await readFile(`/proc/${entry}/stat`, 'utf8')
      }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
          continue
        return false
      }
      // comm 可包含空格/括号，取最后一个右括号之后的固定字段。
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(fields[2]) === pid && fields[0] !== 'Z' && fields[0] !== 'X')
        return false
    }
    return true
  }
  catch {
    return false
  }
}

/** 辅助工具只返回退出码，既不捕获参数/输出，也不把原始错误传播到用户结果。 */
async function helper(command: string, args: string[], timeoutMs: number): Promise<boolean> {
  if (timeoutMs <= 0)
    return false
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: 'ignore' })
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (success: boolean): void => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      resolve(success)
    }
    timer = globalThis.setTimeout(() => {
      child.kill('SIGKILL')
      child.unref()
      finish(false)
    }, timeoutMs)
    child.once('error', () => finish(false))
    child.once('close', code => finish(code === 0))
  })
}

/** 只向命令执行器暴露必要控制，不把平台句柄或 Job 名称作为用户配置。 */
export interface CommandProcess {
  child: ChildProcessWithoutNullStreams
  treeExited: () => Promise<boolean>
  terminate: (timeoutMs: number) => Promise<'confirmed' | 'unknown'>
}

/** 启动受管理进程；Windows helper/Job 失败时没有裸进程降级路径。 */
export function spawnCommand(command: string, args: string[], options: Pick<SpawnOptionsWithoutStdio, 'cwd' | 'env'>): CommandProcess {
  const job = process.platform === 'win32' ? windowsCommand(command, args) : undefined
  const child = spawn(job ? 'powershell.exe' : command, job?.args ?? args, {
    ...options,
    env: job ? { ...options.env, ...job.env } : options.env,
    windowsHide: true,
    shell: false,
    detached: !job,
  })
  let exited = false
  child.once('exit', () => {
    exited = true
  })
  child.once('close', () => {
    exited = true
  })
  let termination: Promise<'confirmed' | 'unknown'> | undefined
  const treeExited = async (): Promise<boolean> => {
    if (!child.pid)
      return true
    if (job)
      return exited && helper('powershell.exe', windowsJobProbe(job.name), 5000)
    return groupExited(child.pid)
  }
  const terminate = (timeoutMs: number): Promise<'confirmed' | 'unknown'> => {
    termination ??= (async () => {
      const deadline = performance.now() + timeoutMs
      let windowsKillConfirmed = !job || exited
      if (child.pid) {
        if (job) {
          if (!exited) {
            // /T 也覆盖 Add-Type 的编译器；payload 的断链后代由 Job 的 close-kill 保证收回。
            windowsKillConfirmed = await helper('taskkill', ['/pid', String(child.pid), '/t', '/f'], Math.max(1, deadline - performance.now()))
            child.kill('SIGKILL')
          }
        }
        else {
          try {
            process.kill(-child.pid, 'SIGKILL')
          }
          catch {
            // 退出 race 或权限失败都必须由下方状态核验决定，不能把 kill 请求当确认。
          }
        }
      }
      while (performance.now() < deadline) {
        if (exited)
          break
        await setTimeout(20)
      }
      let verified = false
      if (exited && job) {
        // 原生命令已自然返回时，helper 已等待所有 Job 成员；被强杀则仍查询 Job 实际归零。
        verified = await helper('powershell.exe', windowsJobProbe(job.name), deadline - performance.now())
        verified &&= windowsKillConfirmed || child.exitCode !== null
      }
      else if (exited) {
        while (performance.now() < deadline) {
          if (await treeExited()) {
            verified = true
            break
          }
          await setTimeout(20)
        }
      }
      // exit 与管道 close 分开：消费者可仍等待回调，但不能据此误判进程仍运行。
      // 异常后丢弃未完成秘密尾部并关闭管道，不等待无法取消的已进入回调。
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      if (!verified)
        child.unref()
      return verified ? 'confirmed' : 'unknown'
    })()
    return termination
  }
  return { child, treeExited, terminate }
}
