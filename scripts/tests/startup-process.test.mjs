import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import fs, { rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'

const entry = pathToFileURL(resolve('packages/cli/tests/helpers/startup-process.mjs')).href

it.skipIf(process.platform !== 'linux')('扫描 Linux 会话时忽略刚退出的进程并保留存活进程组', async () => {
  const { ownedGroups } = await import(entry)
  const directories = vi.spyOn(fs, 'readdir').mockResolvedValue(['101', '102'])
  const stat = vi.spyOn(fs, 'readFile')
    .mockRejectedValueOnce(Object.assign(new Error('No such process'), { code: 'ESRCH' }))
    .mockResolvedValueOnce('102 (live child) S 1 102 100 0')
  syncBuiltinESMExports()
  try {
    await expect(ownedGroups(100)).resolves.toEqual([102])
  }
  finally {
    directories.mockRestore()
    stat.mockRestore()
    syncBuiltinESMExports()
  }
})

/** 只等待本例自己写入的观察点，超时保留失败上下文并交 finally 回收。 */
async function waitFor(check) {
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    if (await check())
      return
    await delay(25)
  }
  throw new Error('Owned startup process did not reach its observation point')
}

it.each([false, true])('回收持有 HTTP 端口的完整后代，根进程先退出=%s', async (earlyExit) => {
  const { spawnOwned, stopOwned } = await import(entry)
  const directory = mkdtempSync(join(tmpdir(), 'hai-startup-process-'))
  const endpoint = join(directory, 'endpoint.json')
  const parentExited = join(directory, 'parent-exited')
  writeFileSync(join(directory, 'descendant.mjs'), `
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
const server = createServer((_request, response) => response.end('owned descendant'))
server.listen(0, '127.0.0.1', () => writeFileSync(${JSON.stringify(endpoint)}, JSON.stringify({ port: server.address().port, pid: process.pid })))
`)
  writeFileSync(join(directory, 'parent.mjs'), `
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
// Windows 独立控制台避免 Node 父自身的退出回收；仍继承外层不可 breakaway 的 Job。
const child = spawn(process.execPath, ['descendant.mjs'], { stdio: 'ignore', detached: process.platform === 'win32' })
child.once('error', error => writeFileSync(${JSON.stringify(endpoint)}, JSON.stringify({ error: error.message })))
process.once('exit', () => writeFileSync(${JSON.stringify(parentExited)}, 'exited'))
const timer = setInterval(() => { if (${earlyExit} && existsSync(${JSON.stringify(endpoint)})) { clearInterval(timer); child.unref(); process.exit(0) } }, 10)
`)
  let child
  let stopped = false
  try {
    child = spawnOwned(process.execPath, ['parent.mjs'], {
      cwd: directory,
      env: { ...process.env },
      stdio: 'ignore',
    })
    await waitFor(() => existsSync(endpoint) && (!earlyExit || existsSync(parentExited)))
    const observation = JSON.parse(readFileSync(endpoint, 'utf8'))
    const url = `http://127.0.0.1:${observation.port}`
    if (earlyExit && process.platform === 'win32') {
      // Windows owner 自动结束提前退出根命令的遗留后代，不等待外层超时。
      await waitFor(() => child.exitCode !== null)
      expect(child.exitCode).toBe(0)
    }
    else {
      expect(await (await fetch(url)).text()).toBe('owned descendant')
    }
    await stopOwned(child)
    stopped = true
    await expect(fetch(url)).rejects.toThrow()
    await waitFor(() => {
      try {
        process.kill(observation.pid, 0)
        // Linux 的孤儿僵尸已停止执行，需等待宿主 init 回收；与既有组核验约定一致。
        return process.platform === 'linux' && /^[ZX]/.test(readFileSync(`/proc/${observation.pid}/stat`, 'utf8').split(') ').at(-1))
      }
      catch (error) { return error.code === 'ESRCH' || error.code === 'ENOENT' }
    })
    // 正常回收后再次调用不会认领其他进程或使清理失败。
    await expect(stopOwned(child)).resolves.toBeUndefined()
  }
  finally {
    if (child && !stopped)
      await stopOwned(child)
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    })
  }
}, 30_000)

it('公开启动命令保留参数并使用显式环境，正常退出后仍可核验所有权已释放', async () => {
  const { spawnOwned, stopOwned } = await import(entry)
  const directory = mkdtempSync(join(tmpdir(), 'hai-startup-process-'))
  const output = join(directory, 'arguments.json')
  const values = [
    'a path with spaces',
    'literal $value',
    'quote"inside',
    'trailing\\',
  ]
  writeFileSync(join(directory, 'probe.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(output)}, JSON.stringify({ args: process.argv.slice(2), ambient: process.env.HAI_STARTUP_AMBIENT ?? null }))`)
  vi.stubEnv('HAI_STARTUP_AMBIENT', 'private-host-value')
  const environment = { ...process.env }
  delete environment.HAI_STARTUP_AMBIENT
  let child
  try {
    child = spawnOwned(process.execPath, ['probe.mjs', ...values], {
      cwd: directory,
      env: environment,
      stdio: 'ignore',
    })
    await waitFor(() => existsSync(output))
    await waitFor(() => child.exitCode !== null || child.signalCode !== null)
    expect(child.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ args: values, ambient: null })
  }
  finally {
    vi.unstubAllEnvs()
    if (child)
      await stopOwned(child)
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    })
  }
}, 30_000)
