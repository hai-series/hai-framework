import { ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { stopProcess } from '../src/acp/ai-acp-process.js'

/** 仅忽略本次拥有进程已经消失的情况；其它清理错误继续报告。 */
function killOwned(pid: number) {
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
      throw error
  }
}

describe('aCP owned process cleanup', () => {
  it('windows 已退出的长期 Agent 不假定后台进程已停止，普通短命令仍可完成', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    const child = new ChildProcess()
    Object.defineProperty(child, 'pid', { value: 999999 })
    child.exitCode = 0
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      await expect(stopProcess(child, { ownedTree: true, closeObserved: true })).rejects.toMatchObject({ kind: 'cleanup' })
      await expect(stopProcess(child)).resolves.toBeUndefined()
    }
    finally {
      Object.defineProperty(process, 'platform', platform)
    }
  })

  it.skipIf(process.platform === 'win32')('pOSIX 主进程已退出后仍停止同组真实后台 writer，且不再次等待 close', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hai-acp-tree-'))
    if (dirname(directory) !== resolve(tmpdir()) || !directory.startsWith(join(tmpdir(), 'hai-acp-tree-')))
      throw new Error('Unexpected process fixture cleanup path')
    const heartbeat = join(directory, 'heartbeat.txt')
    const pidFile = join(directory, 'writer.pid')
    const writer = 'const fs=require("node:fs");fs.writeFileSync(process.argv[2],String(process.pid));setInterval(()=>fs.writeFileSync(process.argv[1],String(Date.now())),10)'
    const source = 'const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e",process.argv[1],process.argv[2],process.argv[3]],{stdio:"ignore"});child.unref()'
    const leader = spawn(process.execPath, ['-e', source, writer, heartbeat, pidFile], { detached: true, stdio: 'ignore' })
    let writerPid: number | undefined
    try {
      await new Promise<void>((done, fail) => {
        leader.once('error', fail)
        leader.once('close', () => done())
      })
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await readFile(heartbeat, 'utf8').then(() => true, () => false))
          break
        await new Promise(done => setTimeout(done, 10))
      }
      writerPid = Number(await readFile(pidFile, 'utf8'))
      await stopProcess(leader, { ownedTree: true, closeObserved: true })
      const stopped = await readFile(heartbeat, 'utf8')
      await new Promise(done => setTimeout(done, 100))
      expect(await readFile(heartbeat, 'utf8')).toBe(stopped)
    }
    finally {
      // 只清理本次独立进程组及其临时目录，失败用例也不留下后台写进程。
      if (leader.pid)
        killOwned(-leader.pid)
      if (writerPid)
        killOwned(writerPid)
      await rm(directory, { recursive: true, force: true })
    }
  }, 10000)
})
