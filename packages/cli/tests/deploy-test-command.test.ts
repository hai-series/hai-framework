/** 使用真实父/子进程和持续心跳验证部署门禁命令超时及取消回收。 */
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDeployTestCommands, runDeployTestCommand } from './helpers/deploy-test-command.js'

let directory: string

function exited(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH'
  }
}

async function recordedPids(): Promise<number[]> {
  const value: unknown = JSON.parse(await readFile(path.join(directory, 'pids.json'), 'utf8'))
  if (!value || typeof value !== 'object')
    throw new Error('Missing command tree identity')
  const pids = [Reflect.get(value, 'parent'), Reflect.get(value, 'child')]
  if (pids.some(pid => typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 1))
    throw new Error('Invalid command tree identity')
  return pids as number[]
}

async function tree(earlyExit?: number): Promise<{ command: string, args: string[] }> {
  const filename = path.join(directory, 'child.cjs')
  await writeFile(filename, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(path.join(directory, 'pids.json'))},JSON.stringify({parent:process.ppid,child:process.pid}));setInterval(()=>fs.appendFileSync(${JSON.stringify(path.join(directory, 'heartbeat'))},'x'),25)`)
  if (process.platform === 'win32') {
    const quote = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`
    // 原生父进程避免 Node 的 libuv Job 提前代替被测 helper 清理后代，隐藏窗口不影响实际执行。
    const wait = earlyExit === undefined ? 'while($true){Start-Sleep -Milliseconds 50}' : `while(!(Test-Path -LiteralPath ${quote(path.join(directory, 'pids.json'))})){Start-Sleep -Milliseconds 10}; exit ${earlyExit}`
    const script = `$ErrorActionPreference='Stop'; Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote(`"${filename}"`)} -WindowStyle Hidden; ${wait}`
    return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] }
  }
  const wait = earlyExit === undefined ? 'setInterval(()=>{},1000)' : `setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(path.join(directory, 'pids.json'))}))process.exit(${earlyExit})},10)`
  return { command: process.execPath, args: ['-e', `require('node:child_process').spawn(process.execPath,[${JSON.stringify(filename)}],{stdio:'ignore'});${wait}`] }
}

async function assertStopped(): Promise<void> {
  for (const pid of await recordedPids())
    expect(exited(pid), `Owned process ${pid} must have exited`).toBe(true)
  const before = await readFile(path.join(directory, 'heartbeat'), 'utf8').catch(() => '')
  await delay(100)
  expect(await readFile(path.join(directory, 'heartbeat'), 'utf8').catch(() => '')).toBe(before)
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'hai-deploy-command-'))
})

afterEach(async () => {
  const pids = await recordedPids().catch(() => [])
  for (const pid of pids) {
    if (exited(pid))
      continue
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 })
    else
      process.kill(pid, 'SIGKILL')
  }
  if (path.dirname(directory) !== tmpdir() || !path.basename(directory).startsWith('hai-deploy-command-'))
    throw new Error('Unexpected command fixture cleanup directory')
  await rm(directory, { recursive: true, force: true })
})

it('超时先回收仍存活父进程的整棵树，返回后后代心跳停止', async () => {
  const input = await tree()
  await expect(runDeployTestCommand(input.command, input.args, { timeoutMs: 2500 })).rejects.toThrow()
  await assertStopped()
}, 20_000)

it('普通成功保留工作目录、环境与输出；非零退出保留原始诊断', async () => {
  const output = await runDeployTestCommand(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({cwd:process.cwd(),env:process.env.HAI_TEST_COMMAND}))'], { cwd: directory, env: { HAI_TEST_COMMAND: '中文 fixture' } })
  expect(JSON.parse(output)).toEqual({ cwd: directory, env: '中文 fixture' })
  await expect(runDeployTestCommand(process.execPath, ['-e', 'process.stdout.write("build stdout");process.stderr.write("build stderr");process.exit(7)'])).rejects.toMatchObject({ reason: 'exit', localTermination: 'confirmed', message: expect.stringMatching(/build stdout\s+build stderr/) })
  await expect(runDeployTestCommand(path.join(directory, 'missing-executable'), [])).rejects.toThrow(/Windows deployment test command job failed|ENOENT/)
})

it('取消先杀树再返回；已经取消时不启动新命令', async () => {
  const input = await tree()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Controlled caller cancellation')), 2500)
  try {
    await expect(runDeployTestCommand(input.command, input.args, { signal: controller.signal })).rejects.toMatchObject({ reason: 'abort', localTermination: 'confirmed' })
    await assertStopped()
    await expect(runDeployTestCommand(process.execPath, ['-e', 'process.exit(0)'], { signal: controller.signal })).rejects.toMatchObject({ reason: 'abort', localTermination: 'not-started' })
  }
  finally {
    clearTimeout(timer)
  }
}, 20_000)

it.each([0, 7])('父提前 exit %i 后仍回收断链后代，不能只凭父 close 确认整树', async (code) => {
  const input = await tree(code)
  await expect(runDeployTestCommand(input.command, input.args, { timeoutMs: 3000 })).rejects.toMatchObject({ localTermination: 'confirmed' })
  await assertStopped()
}, 20_000)

it('作用域总期限提前于外层预算，close等待回收且禁止后续命令', async () => {
  const input = await tree()
  const scope = createDeployTestCommands({ timeoutMs: 20_000, cleanupReserveMs: 17_500 })
  try {
    await expect(scope.run(input.command, input.args)).rejects.toMatchObject({ localTermination: 'confirmed' })
    expect(scope.signal.aborted).toBe(true)
    await scope.close()
    await assertStopped()
    await expect(scope.run(process.execPath, ['-e', 'process.exit(0)'])).rejects.toThrow()
  }
  finally {
    await scope.close()
  }
}, 20_000)

it('输出超限同样回收命令，不保留无限输出', async () => {
  await expect(runDeployTestCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096));setInterval(()=>{},1000)'], { maxOutputBytes: 128 })).rejects.toMatchObject({ reason: 'output-limit', localTermination: 'confirmed' })
}, 15_000)
