/** 启动验收进程的所有权与回收；Windows Job 和 POSIX 进程组均需确认完整退出。 */
import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { windowsTestCommand, windowsTestJobProbe } from './startup-windows-job.ts'

const owners = new WeakMap()

/** 直接返回原生 ChildProcess，保留 stdout/stderr、error 和 close 事件。 */
export function spawnOwned(command, args, options = {}) {
  const job = process.platform === 'win32'
    ? windowsTestCommand(command, args, true)
    : undefined
  const child = spawn(job ? 'powershell.exe' : command, job?.args ?? args, {
    ...options,
    env: {
      ...(options.env ?? process.env),
      ...job?.env,
    },
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  const owner = { job, closed: false, stopping: undefined }
  owners.set(child, owner)
  child.once('error', () => {})
  child.once('close', () => {
    owner.closed = true
  })
  return child
}

function gone(pid) {
  try {
    process.kill(pid, 0)
    return false
  }
  catch (error) { return error?.code === 'ESRCH' }
}

/** Linux 的僵尸已停止执行；其他系统仅接受组已不存在。 */
async function groupEmpty(pid) {
  if (gone(-pid))
    return true
  if (process.platform !== 'linux')
    return false
  try {
    for (const name of await readdir('/proc')) {
      if (!/^\d+$/.test(name))
        continue
      let stat
      try {
        stat = await readFile(`/proc/${name}/stat`, 'utf8')
      }
      catch (error) {
        if (error?.code === 'ENOENT')
          continue
        return false
      }
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(fields[2]) === pid && !['Z', 'X'].includes(fields[0]))
        return false
    }
    return true
  }
  catch { return false }
}

/** 探测命令有独立期限，未知状态不能算作 Job 已空。 */
async function jobEmpty(name, deadline) {
  return new Promise((resolve) => {
    const probe = spawn('powershell.exe', windowsTestJobProbe(name), { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      probe.kill()
      resolve(false)
    }, Math.max(1, deadline - performance.now()))
    probe.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    probe.once('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/** 只有本轮拥有的完整进程树已退出才成功；失败时调用方必须保留临时目录。 */
export async function stopOwned(child) {
  const owner = owners.get(child)
  if (!owner)
    throw new Error('Cannot stop a process that is not owned by the startup runner')
  if (owner.stopping)
    return owner.stopping
  owner.stopping = (async () => {
    if (!child.pid && owner.closed)
      return
    const deadline = performance.now() + 15_000
    if (owner.job) {
      // owner 持有唯一 Job 句柄；关闭它会终止 Job 中所有不可 breakaway 的后代。
      if (!owner.closed && !child.kill('SIGKILL') && child.exitCode === null)
        throw new Error('Could not stop the Windows startup Job owner')
    }
    else if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      }
      catch (error) {
        if (error?.code !== 'ESRCH')
          throw error
      }
    }
    let forced = false
    while (performance.now() < deadline) {
      const empty = owner.job
        ? await jobEmpty(owner.job.name, deadline)
        : !child.pid || await groupEmpty(child.pid)
      if (owner.closed && empty)
        return
      if (!owner.job && child.pid && !forced && deadline - performance.now() < 12_000) {
        forced = true
        try {
          process.kill(-child.pid, 'SIGKILL')
        }
        catch (error) {
          if (error?.code !== 'ESRCH')
            throw error
        }
      }
      await delay(25)
    }
    child.stdout?.destroy()
    child.stderr?.destroy()
    child.unref()
    throw new Error('Startup process tree termination could not be confirmed; temporary files were retained')
  })()
  return owner.stopping
}
