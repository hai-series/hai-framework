import { Buffer } from 'node:buffer'
import { ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { windowsACPCommand } from '../src/acp/ai-acp-process-windows.js'
import { baseEnvironment, stopProcess } from '../src/acp/ai-acp-process.js'

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
  it.skipIf(process.platform !== 'win32').each([false, true])('windows Job 停止中间进程退出后的后台 writer（根退出=%s）', async (rootExits) => {
    const directory = await mkdtemp(join(tmpdir(), 'hai-acp-job-'))
    if (dirname(directory) !== resolve(tmpdir()) || !directory.startsWith(join(tmpdir(), 'hai-acp-job-')))
      throw new Error('Unexpected Windows Job fixture path')
    const heartbeat = join(directory, 'heartbeat.txt')
    const writer = 'process.stderr.write("writer-started\\n");const fs=require("node:fs");setInterval(()=>fs.writeFileSync(process.argv[1],String(Date.now())),10)'
    // libuv 的普通子进程会进入父 Node 的私有 Job；detached 跳过私有 Job，但不 breakaway 我们的外层 Job。
    // https://github.com/libuv/libuv/blob/v1.x/src/win/process.c
    const intermediate = 'process.stderr.write("intermediate-started\\n");const c=require("node:child_process").spawn(process.execPath,["-e",process.argv[1],process.argv[2]],{stdio:["ignore","ignore","inherit"],windowsHide:true,detached:true});c.unref()'
    const root = `process.stderr.write("root-started\\n");const c=require("node:child_process").spawn(process.execPath,["-e",process.argv[1],process.argv[2],process.argv[3]],{stdio:["ignore","ignore","inherit"],windowsHide:true,detached:true});c.unref();${rootExits ? '' : 'setInterval(()=>{},1000)'}`
    const job = windowsACPCommand(process.execPath, ['-e', root, intermediate, writer, heartbeat])
    const child = spawn('powershell.exe', job.args, { env: { ...baseEnvironment(), ...job.env }, shell: false, windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000)
    })
    child.stdout.resume()
    let closed = false
    child.once('close', () => {
      closed = true
    })
    try {
      let current = ''
      for (let attempt = 0; attempt < 200; attempt++) {
        current = await readFile(heartbeat, 'utf8').catch(() => '')
        if (current)
          break
        await new Promise(done => setTimeout(done, 20))
      }
      expect(current, stderr).not.toBe('')
      await new Promise(done => setTimeout(done, 100))
      expect(await readFile(heartbeat, 'utf8')).not.toBe(current)
      await stopProcess(child, { ownedTree: true, closeObserved: closed, windowsJob: job.name })
      const stopped = await readFile(heartbeat, 'utf8')
      await new Promise(done => setTimeout(done, 100))
      expect(await readFile(heartbeat, 'utf8')).toBe(stopped)
    }
    finally {
      await stopProcess(child, { ownedTree: true, closeObserved: closed, windowsJob: job.name })
      await rm(directory, { recursive: true, force: true })
    }
    await expect(readFile(heartbeat)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30000)

  it.skipIf(process.platform !== 'win32')('windows Job 原样传递 UTF-8 stdio 和包含引号的参数', async () => {
    const argument = '中文 $() ; "quoted" C:\\tail\\'
    const code = 'process.stdout.write(JSON.stringify({arg:process.argv[1],privatePayload:Object.keys(process.env).some(name=>name.startsWith("__HAI_AI_ACP_JOB_"))})+"\\n");process.stdin.on("data",data=>process.stdout.write(data))'
    const job = windowsACPCommand(process.execPath, ['-e', code, argument])
    const child = spawn('powershell.exe', job.args, { env: { ...baseEnvironment(), ...job.env }, shell: false, windowsHide: true })
    child.stderr.resume()
    let closed = false
    child.once('close', () => {
      closed = true
    })
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    try {
      const content = Buffer.from('你好 ACP 🧪\n', 'utf8')
      child.stdin.write(content)
      let text = ''
      for (let attempt = 0; attempt < 200; attempt++) {
        text = Buffer.concat(chunks).toString('utf8')
        if (text.includes('你好 ACP 🧪\n'))
          break
        await new Promise(done => setTimeout(done, 20))
      }
      const lines = text.split('\n')
      expect(JSON.parse(lines[0]!)).toEqual({ arg: argument, privatePayload: false })
      expect(lines[1]).toBe('你好 ACP 🧪')
    }
    finally {
      await stopProcess(child, { ownedTree: true, closeObserved: closed, windowsJob: job.name })
    }
  }, 30000)

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
