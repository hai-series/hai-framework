/** 样板 E2E 的独立 TCP 计数进程；只处理本轮私有计数文件，不读取业务环境。 */
import { existsSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import process from 'node:process'

const [mode, stateFile] = process.argv.slice(2)
if (!stateFile || !['serve', 'ready', 'probe', 'closed'].includes(mode))
  throw new Error('Expected sentinel operation and owned state file')

/**
 * 读取本轮计数快照；服务端用同目录 rename 原子替换，读者不会读到半份 JSON。
 * @returns {object | undefined} 尚未就绪时为空，否则返回安全计数快照。
 * @example
 * ```js
 * const current = state()
 * if (current?.closed) process.exitCode = 0
 * ```
 */
function state() {
  return existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : undefined
}

/**
 * 有界等待独立计数进程状态；不使用门禁父线程的事件循环计数。
 * @param {function(object | undefined): boolean} predicate - 本操作必须满足的状态条件。
 * @returns {Promise<object>} 已满足条件的状态快照。
 * @throws 就绪、正控或 TCP 服务关闭未在期限内确认时抛错。
 * @example
 * ```js
 * await waitFor(current => current?.port > 0 && !current.closed)
 * ```
 */
async function waitFor(predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const current = state()
    if (predicate(current))
      return current
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Database isolation sentinel ${mode} timed out`)
}

if (mode === 'serve') {
  const current = { pid: process.pid, port: 0, connections: 0, closed: false }
  let pending = Promise.resolve()
  /**
   * 单写者先完整写临时文件，再原子替换本轮快照，持久保留计数供父进程验收。
   * @returns {Promise<void>} 失败直接使计数进程失败，不能把无法测量报告成零连接。
   * @example
   * ```js
   * current.connections++
   * await save()
   * ```
   */
  const save = () => {
    const snapshot = JSON.stringify(current)
    // 串行保存快照；短暂的 Windows 文件共享冲突不能使计数进程提前退出。
    pending = pending.then(async () => {
      await writeFile(`${stateFile}.next`, snapshot)
      const deadline = Date.now() + 2000
      for (;;) {
        try {
          await rename(`${stateFile}.next`, stateFile)
          return
        }
        catch (error) {
          if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || Date.now() >= deadline)
            throw error
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      }
    })
    return pending
  }
  const server = createServer((socket) => {
    current.connections++
    void save()
    socket.destroy()
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Database isolation sentinel has no TCP address')
    current.port = address.port
    void save()
  })
  const stop = setInterval(() => {
    if (!existsSync(`${stateFile}.stop`))
      return
    clearInterval(stop)
    server.close(() => {
      current.closed = true
      void save()
    })
  }, 20)
}
else if (mode === 'ready') {
  await waitFor(current => current?.port > 0 && !current.closed)
}
else if (mode === 'probe') {
  const before = await waitFor(current => current?.port > 0 && !current.closed)
  const database = JSON.parse(process.env.HAI_DB || '{}')
  if (database.host !== '127.0.0.1' || database.port !== before.port)
    throw new Error('Positive control must consume the ambient fixture database')
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: database.host, port: database.port })
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.end()
      resolve()
    })
  })
  await waitFor(current => current?.connections > before.connections)
}
else {
  // 这里只确认 TCP 服务已关闭；真实退出由父进程异步等待其持有的 ChildProcess。
  // Linux 子进程在父线程被 spawnSync 阻塞时可能成为僵尸，kill(pid, 0) 仍会成功。
  await waitFor(current => current?.closed === true)
}
