/** 本机真实命令树、父进程早退和输出失败；用 PID 与持续心跳核对退出事实。 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readWindowsFixtureProcesses, windowsFixtureProcessesStopped, windowsTreeFixture } from '../../../scripts/test-process-identity.js'
import { runCommand } from '../src/container/deploy-command.js'
import { getDeployCommandState } from '../src/index.js'

let root: string
const pids = new Set<number>()

/** 只有 ESRCH 才确认 PID 不存在，不把权限失败当作退出。 */
function exited(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH'
  }
}

/** 子进程先写 PID，再周期性落盘心跳；输出足够长，越过秘密匹配的保留尾部。 */
function childCode(): string {
  const record = process.platform === 'win32' ? '' : `fs.writeFileSync(${JSON.stringify(path.join(root, 'pids.json'))},JSON.stringify({parent:process.ppid,child:process.pid}));`
  return `const fs=require('node:fs');${record}process.stdout.write('tree ready ready ready ready ready\\n');setInterval(()=>fs.appendFileSync(${JSON.stringify(path.join(root, 'heartbeat'))},'x'),30)`
}

/** 创建两层命令树；父进程早退时先等待子进程已真正开始，而非依赖调度速度。 */
function tree(earlyParentExit = false): string {
  return `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(childCode())}],{stdio:${JSON.stringify(earlyParentExit ? 'ignore' : 'inherit')}});${earlyParentExit ? `setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(path.join(root, 'pids.json'))}))process.exit(0)},10)` : 'setInterval(()=>{},1000)'}`
}

/** Windows 显式创建和记录父/子实例；原生父进程不会由 Node 自带 Job 提前清空测试后代。 */
async function treeInput(earlyParentExit = false): Promise<{ command: string, args: string[] }> {
  if (process.platform !== 'win32')
    return { command: process.execPath, args: ['-e', tree(earlyParentExit)] }
  const childFile = path.join(root, 'child.cjs')
  await writeFile(childFile, childCode())
  return windowsTreeFixture(childFile, path.join(root, 'pids.json'), path.join(root, 'heartbeat'), earlyParentExit ? 0 : undefined)
}

/** 实际 PID 来自夹具写入文件，不以 kill 请求已发送代替确认。 */
async function assertStopped(): Promise<void> {
  if (process.platform === 'win32') {
    expect(await windowsFixtureProcessesStopped(await readWindowsFixtureProcesses(path.join(root, 'pids.json')))).toBe(true)
    const before = await readFile(path.join(root, 'heartbeat'), 'utf8').catch(() => '')
    await setTimeout(100)
    expect(await readFile(path.join(root, 'heartbeat'), 'utf8').catch(() => '')).toBe(before)
    return
  }
  const recorded: unknown = JSON.parse(await readFile(path.join(root, 'pids.json'), 'utf8'))
  if (!recorded || typeof recorded !== 'object' || !('parent' in recorded) || !('child' in recorded))
    throw new Error('Missing tree fixture PIDs')
  for (const pid of [recorded.parent, recorded.child]) {
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 1)
      throw new Error('Invalid tree fixture PID')
    pids.add(pid)
    expect(exited(pid), `Process ${pid} must have exited`).toBe(true)
  }
  const before = await readFile(path.join(root, 'heartbeat'), 'utf8').catch(() => '')
  await setTimeout(100)
  expect(await readFile(path.join(root, 'heartbeat'), 'utf8').catch(() => '')).toBe(before)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hai-command-树 '))
})

afterEach(async () => {
  if (process.platform === 'win32') {
    const identities = await readWindowsFixtureProcesses(path.join(root, 'pids.json')).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return []
      throw error
    })
    expect(await windowsFixtureProcessesStopped(identities, true)).toBe(true)
  }
  // 测试异常时仍只清理本轮记录的子进程，不依赖下一次运行回收。
  const recorded = process.platform === 'win32' ? '' : await readFile(path.join(root, 'pids.json'), 'utf8').catch(() => '')
  if (recorded) {
    const value: unknown = JSON.parse(recorded)
    if (value && typeof value === 'object') {
      for (const key of ['parent', 'child']) {
        const pid = Reflect.get(value, key)
        if (typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 1)
          pids.add(pid)
      }
    }
  }
  for (const pid of pids) {
    if (exited(pid))
      continue
    process.kill(pid, 'SIGKILL')
  }
  pids.clear()
  if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-command-树 '))
    throw new Error('Unexpected command fixture cleanup path')
  await rm(root, { recursive: true, force: true })
})

describe('managed local command trees', () => {
  it('超时在本地父/子真实退出后才返回 confirmed，持续心跳停止', async () => {
    const input = await treeInput()
    const result = await runCommand(input.command, input.args, { timeoutMs: 2500 })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected a timeout')
    expect(getDeployCommandState(result.error)).toMatchObject({ reason: 'timeout', localTermination: 'confirmed' })
    await assertStopped()
  }, 20_000)

  it('父命令提前正常退出仍收回断链后代；不会把父退出当作整树完成', async () => {
    const input = await treeInput(true)
    const result = await runCommand(input.command, input.args, { timeoutMs: 3500 })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected unfinished descendants to fail')
    expect(getDeployCommandState(result.error)?.localTermination).toBe('confirmed')
    await assertStopped()
  }, 20_000)

  it('回调失败同样等待整树退出且不泄漏原始回调异常', async () => {
    const input = await treeInput()
    const result = await runCommand(input.command, input.args, { onOutput: () => {
      throw new Error('private-callback-value')
    }, secrets: ['private-callback-value'] })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected output failure')
    expect(getDeployCommandState(result.error)).toMatchObject({ reason: 'output', localTermination: 'confirmed' })
    expect(JSON.stringify(result)).not.toContain('private-callback-value')
    await assertStopped()
  }, 20_000)

  it('命令与 deadline race 只结束一次，成功完成后不会残留超时回调', async () => {
    for (const timeoutMs of [750, 1000, 1500]) {
      const result = await runCommand(process.execPath, ['-e', 'setTimeout(()=>process.stdout.write("finished"),200)'], { timeoutMs })
      if (result.success)
        expect(result.data.stdout).toBe('finished')
      else
        expect(getDeployCommandState(result.error)).toMatchObject({ reason: 'timeout', localTermination: 'confirmed' })
    }
    const completed = await runCommand(process.execPath, ['-e', 'process.stdout.write("complete")'], { timeoutMs: 2500 })
    expect(completed.success).toBe(true)
    await setTimeout(100)
  }, 30_000)

  it('unicode/空格工作目录、空参数、引号、尾反斜杠、环境与 UTF-8 stdin 原样传递', async () => {
    const args = ['', 'a b', '引号"和路径\\', '\\"', 'emoji 🐈']
    const input = '输入 🐈\n第二行'
    const script = `let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>input+=part);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),env:process.env.TEST_COMMAND_UNICODE,input})))`
    const result = await runCommand(process.execPath, ['-e', script, ...args], { cwd: root, env: { TEST_COMMAND_UNICODE: '环境 值 🐈' }, input })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error(result.error.message)
    expect(JSON.parse(result.data.stdout)).toEqual({ args, cwd: root, env: '环境 值 🐈', input })
  }, 20_000)

  it('非法 timeout/核验等待/空字节参数在执行前拒绝，不产生标记文件', async () => {
    const marker = path.join(root, 'should-not-run')
    const args = ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')`]
    const cases = [{ timeoutMs: 0 }, { timeoutMs: -1 }, { timeoutMs: 2147483648 }, { terminationTimeoutMs: 0 }, { terminationTimeoutMs: 60001 }]
    for (const options of cases) {
      const result = await runCommand(process.execPath, args, options)
      expect(result.success).toBe(false)
      if (!result.success)
        expect(getDeployCommandState(result.error)?.localTermination).toBe('not-started')
    }
    expect((await runCommand(process.execPath, [...args, '\0'])).success).toBe(false)
    await expect(readFile(marker)).rejects.toThrow()
  })

  it('已开始但不结束的输出回调不会无限阻止超时终止，也不会继续交付输出', async () => {
    let release: () => void = () => {}
    let calls = 0
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const input = await treeInput()
    const result = await runCommand(input.command, input.args, { timeoutMs: 2500, onOutput: async () => {
      calls++
      await pending
    } })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(getDeployCommandState(result.error)?.localTermination).toBe('confirmed')
    release()
    await assertStopped()
    expect(calls).toBe(1)
  }, 20_000)

  it.skipIf(process.platform !== 'win32')('核验等待耗尽时如实返回 unknown，不能以 kill 请求替代确认', async () => {
    const input = await treeInput()
    const result = await runCommand(input.command, input.args, { timeoutMs: 2500, terminationTimeoutMs: 1 })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected a timeout')
    expect(getDeployCommandState(result.error)).toMatchObject({ reason: 'timeout', localTermination: 'unknown' })
    await vi.waitFor(assertStopped, { timeout: 5000 })
  }, 20_000)
})
