import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { spawnOwned, stopOwned } from '../../packages/cli/tests/helpers/startup-process.mjs'

let directory
beforeEach(() => {
  directory = realpathSync.native(mkdtempSync(join(tmpdir(), 'hai-e2e-cleanup-')))
  vi.stubEnv('HAI_TEST_RUNNER_OBSERVATIONS_ROOT', directory)
  const module = join(directory, 'node_modules/@playwright/test')
  mkdirSync(module, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'runner-fixture',
    scripts: { dev: 'node dev.cjs' },
  }))
  writeFileSync(join(module, 'package.json'), JSON.stringify({
    bin: { playwright: './cli.cjs' },
  }))
  const bin = join(directory, 'node_modules/.bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'playwright.cmd'), '@echo off\r\nnode "%~dp0..\\@playwright\\test\\cli.cjs" %*\r\n')
  if (process.platform !== 'win32') {
    writeFileSync(join(bin, 'playwright'), '#!/bin/sh\nexec node "$(dirname "$0")/../@playwright/test/cli.cjs" "$@"\n', { mode: 0o755 })
  }
  // 用真实子进程模拟 Playwright 在退出前写入报告，验证清理时机和退出码。
  writeFileSync(join(module, 'cli.cjs'), `
const fs = require('node:fs')
const path = require('node:path')
const observationsRoot = process.env.HAI_TEST_RUNNER_OBSERVATIONS_ROOT
const args = process.argv.slice(2)
const option = args.find(value => value.startsWith('--output='))
const output = option ? option.slice('--output='.length) : args[args.indexOf('--output') + 1] && args.includes('--output') ? args[args.indexOf('--output') + 1] : 'test-results'
const html = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report'
const evidence = process.env.HAI_AUTH_EVIDENCE_DIR || path.join(output, 'evidence')
for (const directory of [output, html, evidence]) fs.mkdirSync(directory, {recursive:true})
fs.writeFileSync(path.join(output, 'screenshot.png'), 'test')
fs.writeFileSync(path.join(html, 'index.html'), 'test')
fs.writeFileSync(path.join(evidence, 'auth.png'), 'test')
fs.writeFileSync(process.env.HAI_E2E_DATA_ROOT + '/test.db', 'test data')
fs.writeFileSync(path.join(observationsRoot, 'data-root.txt'), process.env.HAI_E2E_DATA_ROOT)
fs.appendFileSync(path.join(observationsRoot, 'data-roots.jsonl'), JSON.stringify(process.env.HAI_E2E_DATA_ROOT) + '\\n')
fs.writeFileSync(path.join(observationsRoot, 'child-pid.txt'), String(process.pid))
fs.appendFileSync(path.join(observationsRoot, 'observations.jsonl'), JSON.stringify({ output, html, evidence, group: process.env.HAI_E2E_GROUP, cwd: process.cwd(), copiedGit: fs.existsSync(path.join(process.cwd(), '.git')) }) + '\\n')
fs.appendFileSync(path.join(observationsRoot, 'runs.txt'), JSON.stringify(process.argv.slice(2)) + '\\n')
if (args.includes('--scenario-env')) {
  const file = path.resolve('.env.test')
  fs.writeFileSync(path.join(process.env.HAI_E2E_DATA_ROOT, 'environment-backups.json'), JSON.stringify({ [file]: fs.readFileSync(file, 'utf8') }))
  fs.writeFileSync(file, 'FEATURE_TEST_CONDITION=changed\\n')
}
if (process.argv.includes('--orphan-fail')) {
  const { spawn } = require('node:child_process');
  const heartbeat = path.join(observationsRoot, 'orphan-heartbeat.txt');
  const orphan = spawn(process.execPath, ['-e', 'const fs = require("node:fs"); const file = process.argv[1]; fs.writeFileSync(file, "ready"); setInterval(() => fs.appendFileSync(file, "."), 20)', heartbeat], { stdio: 'inherit' });
  fs.writeFileSync(path.join(observationsRoot, 'orphan-pid.txt'), String(orphan.pid));
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(heartbeat) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  if (!fs.existsSync(heartbeat)) process.exit(125);
  process.exit(7);
}
if (process.argv.includes('--wait')) {
  process.stdout.write('ready\\n')
  setInterval(() => {}, 1000)
}
else {
  process.exit(process.argv.includes('--other-fail') ? 9 : process.argv.includes('--fail') ? 7 : 0)
}
`)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

it.each([0, 7])('测试退出 %s 后保留证据、回收数据且保留退出码', (code) => {
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    ...(code
      ? ['--fail']
      : []),
  ], {
    cwd: directory,
  })
  expect(result.status).toBe(code)
  const [observed] = observations()
  expect(observed.cwd).toBe(directory)
  expect(existsSync(resolve(directory, observed.output, 'screenshot.png'))).toBe(true)
  expect(existsSync(resolve(directory, observed.html, 'index.html'))).toBe(true)
  expect(existsSync(resolve(directory, observed.evidence, 'auth.png'))).toBe(true)
  expect(existsSync(join(directory, 'package.json'))).toBe(true)
  expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
}, 30_000)
it('独立配置失败后继续收集，隔离数据与证据并保留首个失败码', () => {
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    '--config',
    'first.ts',
    '--next',
    '--fail',
    '--next',
    '--config',
    'last.ts',
    '--other-fail',
  ], { cwd: directory })
  expect(result.status).toBe(7)
  const runs = readFileSync(join(directory, 'runs.txt'), 'utf8')
  expect(runs).toContain('first.ts')
  expect(runs).toContain('last.ts')
  const groups = observations()
  expect(groups).toHaveLength(3)
  expect(new Set(groups.map(group => group.output)).size).toBe(3)
  for (const group of groups)
    expect(existsSync(resolve(directory, group.output, 'screenshot.png'))).toBe(true)
  const roots = readFileSync(join(directory, 'data-roots.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(new Set(roots).size).toBe(3)
  expect(roots.every(root => !existsSync(root))).toBe(true)
}, 20_000)

it.each([false, true])('专项配置在成功或失败退出后恢复真实模式文件（failed=%s）', (failed) => {
  const file = join(directory, '.env.test')
  const original = '# Preserve comments and actual configuration\nFEATURE_TEST_CONDITION=original\n'
  writeFileSync(file, original)
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    '--scenario-env',
    ...(failed
      ? ['--fail']
      : []),
  ], { cwd: directory })
  expect(result.status).toBe(failed ? 7 : 0)
  expect(readFileSync(file, 'utf8')).toBe(original)
  expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
}, 20_000)

it('同一配置可按组切换模式，分组参数和环境不会串到其他轮次', () => {
  const config = ['--config', 'playwright.config.ts']
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    ...config,
    '--next',
    '--e2e-group=session-close',
    ...config,
    '--next',
    ...config,
  ], {
    cwd: directory,
    env: { ...process.env, HAI_E2E_GROUP: 'inherited-group' },
  })
  expect(result.status).toBe(0)
  expect(observations().map(({ group }) => group)).toEqual([undefined, 'session-close', undefined])
  const runs = readFileSync(join(directory, 'runs.txt'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(runs.every(args => !args.includes('--e2e-group=session-close'))).toBe(true)
  // 三个独立 Windows Job 都要确认完整退出，期限包含原生 owner 的启动与探测。
}, 20_000)

it('取消时结束测试进程、回收数据并保留已写入的报告', async () => {
  // 通过真实进程触发同一 SIGTERM 处理器，兼容 Windows 无法发送 POSIX 信号的差异。
  const entry = pathToFileURL(resolve('packages/cli/tests/helpers/run-e2e.mjs')).href
  const script = `process.stdin.once('data', () => process.emit('SIGTERM')); await import(${JSON.stringify(entry)}); process.stdin.destroy()`
  const runner = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    script,
    '--',
    'cleanup-test',
    '--wait',
  ], {
    cwd: directory,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  try {
    runner.stdout.on('data', (chunk) => {
      if (String(chunk).includes('ready'))
        runner.stdin.end('cancel')
    })
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cancelled E2E runner did not exit')), 10_000)
      runner.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      runner.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code)
      })
    })
    expect(code).toBe(1)
    const childPid = Number(readFileSync(join(directory, 'child-pid.txt'), 'utf8'))
    expect(() => process.kill(childPid, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }))
    const [observed] = observations()
    expect(existsSync(resolve(directory, observed.output, 'screenshot.png'))).toBe(true)
    expect(existsSync(resolve(directory, observed.html, 'index.html'))).toBe(true)
    expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
  }
  finally {
    if (runner.exitCode === null && runner.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', [
          '/pid',
          String(runner.pid),
          '/t',
          '/f',
        ], { windowsHide: true, stdio: 'ignore' })
      }
      else {
        runner.kill()
      }
    }
  }
}, 15_000)

function observations() {
  return readFileSync(join(directory, 'observations.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
}

it('尊重显式证据和报告目录，保留既存报告及输出参数', () => {
  for (const name of ['test-results', 'playwright-report']) {
    mkdirSync(join(directory, name), { recursive: true })
    writeFileSync(join(directory, name, 'old-report.txt'), 'old report')
  }
  const evidence = join(directory, 'selected-evidence')
  const html = join(directory, 'selected-html')
  const output = join(directory, 'selected-output')
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    `--output=${output}`,
  ], {
    cwd: directory,
    env: { ...process.env, HAI_AUTH_EVIDENCE_DIR: evidence, PLAYWRIGHT_HTML_OUTPUT_DIR: html },
  })
  expect(result.status).toBe(0)
  expect(observations()).toEqual([
    {
      output,
      html,
      evidence,
      cwd: directory,
      copiedGit: false,
    },
  ])
  for (const name of ['test-results', 'playwright-report'])
    expect(readFileSync(join(directory, name, 'old-report.txt'), 'utf8')).toBe('old report')
}, 30_000)

it('数据回收失败不覆盖原始非零退出码', () => {
  const entry = pathToFileURL(resolve('packages/cli/tests/helpers/run-e2e.mjs')).href
  const script = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; const original = fs.rmSync; fs.rmSync = (path, options) => { if (String(path).includes('hai-browser-e2e-')) throw new Error('Injected data cleanup failure'); return original(path, options) }; syncBuiltinESMExports(); await import(${JSON.stringify(entry)})`
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    script,
    '--',
    'cleanup-test',
    '--fail',
  ], { cwd: directory })
  const dataRoot = readFileSync(join(directory, 'data-root.txt'), 'utf8')
  try {
    expect(result.status).toBe(7)
    expect(String(result.stderr)).toContain('E2E data cleanup failed')
  }
  finally {
    expect(dataRoot).toContain('hai-browser-e2e-')
    const ownedRoot = dirname(dataRoot)
    expect(ownedRoot).toContain('hai-browser-e2e-')
    rmSync(ownedRoot, { recursive: true, force: true })
  }
}, 30_000)

it.each(['PLAYWRIGHT_HTML_OUTPUT_DIR', 'PLAYWRIGHT_HTML_REPORT'])('实际工作目录执行时相对 %s、证据和输出目录仍相对源工作目录保存', (htmlVariable) => {
  const result = spawnSync(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    '--output',
    'selected-output',
  ], {
    cwd: directory,
    env: {
      ...process.env,
      HAI_AUTH_EVIDENCE_DIR: 'selected-evidence',
      PLAYWRIGHT_HTML_OUTPUT_DIR: undefined,
      PLAYWRIGHT_HTML_REPORT: undefined,
      [htmlVariable]: 'selected-html',
    },
  })
  expect(result.status).toBe(0)
  expect(observations()).toEqual([
    {
      output: 'selected-output',
      html: 'selected-html',
      evidence: 'selected-evidence',
      cwd: directory,
      copiedGit: false,
    },
  ])
  expect(existsSync(join(directory, 'selected-output/screenshot.png'))).toBe(true)
  expect(existsSync(join(directory, 'selected-html/index.html'))).toBe(true)
  expect(existsSync(join(directory, 'selected-evidence/auth.png'))).toBe(true)
  // Windows 原生 Job 的启动及退出探测在应用矩阵并行运行时也须有独立预算。
}, 20_000)

it('根命令退出 7 时回收仍持有 stdio 的后台子进程，保留退出码且不会等待 close 死锁', async () => {
  const runner = spawnOwned(process.execPath, [
    resolve('packages/cli/tests/helpers/run-e2e.mjs'),
    '--orphan-fail',
  ], {
    cwd: directory,
    env: process.env,
    stdio: 'ignore',
  })
  let timer
  try {
    const code = await Promise.race([
      new Promise((resolve, reject) => {
        runner.once('error', reject)
        runner.once('exit', resolve)
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Runner waited for inherited orphan stdio')), 15_000) }),
    ])
    expect(code).toBe(7)
    await stopOwned(runner)
    const pid = Number(readFileSync(join(directory, 'orphan-pid.txt'), 'utf8'))
    let terminated = false
    try {
      process.kill(pid, 0)
      // Linux 孤儿僵尸已停止执行，与进程组所有权核验的约定一致。
      terminated = process.platform === 'linux' && /^[ZX]/.test(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1))
    }
    catch (error) {
      terminated = ['ESRCH', 'ENOENT'].includes(error.code)
    }
    expect(terminated).toBe(true)
    const heartbeat = readFileSync(join(directory, 'orphan-heartbeat.txt'), 'utf8')
    expect(heartbeat).toContain('ready')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(readFileSync(join(directory, 'orphan-heartbeat.txt'), 'utf8')).toBe(heartbeat)
  }
  finally {
    clearTimeout(timer)
    await stopOwned(runner)
  }
}, 45_000)
