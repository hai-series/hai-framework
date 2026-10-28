/** 真实 globalSetup 与 Worker 退出回归；只替换引擎命令返回，不访问容器或镜像。 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { windowsTestCommand, windowsTestJobProbe } from '../test-command-windows.js'

const vitest = join(dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')
const setup = pathToFileURL(resolve('scripts/test-image-cleanup-setup.mjs')).href

it('真实全局清理超过默认十秒时仍允许 forks worker 正常退出', () => {
  const parent = resolve('tmp')
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(join(parent, 'image-cleanup-event-loop-'))
  if (dirname(directory) !== parent)
    throw new Error('Unexpected event-loop fixture cleanup directory')
  try {
    writeFileSync(join(directory, 'vitest.config.mjs'), 'export default { test: { include: ["probe.test.mjs"], pool: "forks", maxWorkers: 1, globalSetup: ["./setup.mjs"] } }')
    writeFileSync(join(directory, 'probe.test.mjs'), 'import { it, expect } from "vitest"; it("no resources", () => expect(1).toBe(1))')
    writeFileSync(join(directory, 'setup.mjs'), `
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import setup from ${JSON.stringify(setup)}
export default function(project) {
  const teardown = setup(project)
  process.env.HAI_TEST_IMAGE_PROBE_OWNER = project.config.env.HAI_TEST_IMAGE_RUN
  writeFileSync(project.config.env.HAI_TEST_IMAGE_LEDGER, JSON.stringify({ runtime: 'podman', imageRef: 'localhost/hai-event-loop:1' }) + '\\n')
  return teardown
}
`)
    // 同一个同步算法真实运行十二秒；在 Worker 内也通过同一 Node preload 拦截，无生产测试开关。
    writeFileSync(join(directory, 'engine-preload.mjs'), `
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import process from 'node:process'
const original = childProcess.execFileSync
let delayed = false
let removed = false
childProcess.execFileSync = (binary, args, options) => {
  if (binary !== 'podman') return original(binary, args, options)
  if (!delayed) { delayed = true; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 12000) }
  const id = 'a'.repeat(64)
  if (args[0] === 'image' && args[1] === 'ls') return removed ? '' : id + '\\n'
  if (args[0] === 'image' && args[1] === 'inspect') return JSON.stringify([{ Id: id, RepoTags: ['localhost/hai-event-loop:1'], Config: { Labels: { 'org.h-ai.test.image-run': process.env.HAI_TEST_IMAGE_PROBE_OWNER } } }])
  if (args[0] === 'image' && args[1] === 'rm') { removed = true; return '' }
  throw new Error('Unexpected fake engine operation')
}
syncBuiltinESMExports()
`)
    // preload 是本轮隔离的 Node 环境选项，文件 Worker 不继承宿主的 eval/入口 argv。
    const preload = `--import=${pathToFileURL(join(directory, 'engine-preload.mjs')).href}`
    const args = [vitest, 'run']
    const job = process.platform === 'win32' ? windowsTestCommand(process.execPath, args) : undefined
    const result = spawnSync(job ? 'powershell.exe' : process.execPath, job?.args ?? args, {
      cwd: directory,
      env: { ...process.env, ...job?.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ') },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 35_000,
      maxBuffer: 1024 * 1024,
    })
    if (job)
      expect(spawnSync('powershell.exe', windowsTestJobProbe(job.name), { windowsHide: true, timeout: 10_000 }).status).toBe(0)
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('Test image cleanup report:')
    expect(result.stdout + result.stderr).not.toMatch(/Timeout terminating .* worker|close timed out/)
    const report = JSON.parse(readFileSync(join(directory, 'test-results', /image-cleanup-[a-f0-9-]+\.json/.exec(result.stdout)[0]), 'utf8'))
    expect(report.reports[0].failures).toEqual([])
    expect(report.reports[0].removed).toHaveLength(1)
    expect(Date.parse(report.reports[0].finishedAt) - Date.parse(report.reports[0].startedAt)).toBeGreaterThanOrEqual(12_000)
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 60_000)
