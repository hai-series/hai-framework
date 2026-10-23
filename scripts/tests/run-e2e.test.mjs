import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

let directory
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hai-e2e-cleanup-'))
  const module = join(directory, 'node_modules/@playwright/test')
  mkdirSync(module, { recursive: true })
  writeFileSync(join(directory, 'package.json'), '{}')
  writeFileSync(join(module, 'package.json'), JSON.stringify({ exports: { './cli': './cli.cjs' } }))
  // 用真实子进程模拟 Playwright 在退出前写入报告，验证清理时机和退出码。
  writeFileSync(join(module, 'cli.cjs'), `
const fs = require('node:fs')
const path = require('node:path')
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
fs.writeFileSync('data-root.txt', process.env.HAI_E2E_DATA_ROOT)
fs.appendFileSync('data-roots.jsonl', JSON.stringify(process.env.HAI_E2E_DATA_ROOT) + '\\n')
fs.writeFileSync('child-pid.txt', String(process.pid))
fs.appendFileSync('observations.jsonl', JSON.stringify({ output, html, evidence }) + '\\n')
fs.appendFileSync('runs.txt', JSON.stringify(process.argv.slice(2)) + '\\n')
if (process.argv.includes('--wait')) {
  process.stdout.write('ready\\n')
  setInterval(() => {}, 1000)
}
else {
  process.exit(process.argv.includes('--other-fail') ? 9 : process.argv.includes('--fail') ? 7 : 0)
}
`)
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

it.each([0, 7])('测试退出 %s 后保留证据、回收数据且保留退出码', (code) => {
  const result = spawnSync(process.execPath, [resolve('scripts/run-e2e.mjs'), ...(code ? ['--fail'] : [])], { cwd: directory })
  expect(result.status).toBe(code)
  const [observed] = observations()
  expect(existsSync(resolve(directory, observed.output, 'screenshot.png'))).toBe(true)
  expect(existsSync(resolve(directory, observed.html, 'index.html'))).toBe(true)
  expect(existsSync(resolve(directory, observed.evidence, 'auth.png'))).toBe(true)
  expect(existsSync(join(directory, 'package.json'))).toBe(true)
  expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
})
it('独立配置失败后继续收集，隔离数据与证据并保留首个失败码', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/run-e2e.mjs'), '--config', 'first.ts', '--next', '--fail', '--next', '--config', 'last.ts', '--other-fail'], { cwd: directory })
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
})

it('取消时结束测试进程、回收数据并保留已写入的报告', async () => {
  // 通过真实进程触发同一 SIGTERM 处理器，兼容 Windows 无法发送 POSIX 信号的差异。
  const entry = pathToFileURL(resolve('scripts/run-e2e.mjs')).href
  const script = `process.stdin.once('data', () => process.emit('SIGTERM')); await import(${JSON.stringify(entry)}); process.stdin.destroy()`
  const runner = spawn(process.execPath, ['--input-type=module', '-e', script, '--', 'cleanup-test', '--wait'], { cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] })
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
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/pid', String(runner.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      else
        runner.kill()
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
  const result = spawnSync(process.execPath, [resolve('scripts/run-e2e.mjs'), `--output=${output}`], {
    cwd: directory,
    env: { ...process.env, HAI_AUTH_EVIDENCE_DIR: evidence, PLAYWRIGHT_HTML_OUTPUT_DIR: html },
  })
  expect(result.status).toBe(0)
  expect(observations()).toEqual([{ output, html, evidence }])
  for (const name of ['test-results', 'playwright-report'])
    expect(readFileSync(join(directory, name, 'old-report.txt'), 'utf8')).toBe('old report')
})

it('数据回收失败不覆盖原始非零退出码', () => {
  const entry = pathToFileURL(resolve('scripts/run-e2e.mjs')).href
  const script = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; const original = fs.rmSync; fs.rmSync = (path, options) => { if (String(path).includes('hai-browser-e2e-')) throw new Error('Injected data cleanup failure'); return original(path, options) }; syncBuiltinESMExports(); await import(${JSON.stringify(entry)})`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, '--', 'cleanup-test', '--fail'], { cwd: directory })
  const dataRoot = readFileSync(join(directory, 'data-root.txt'), 'utf8')
  try {
    expect(result.status).toBe(7)
    expect(String(result.stderr)).toContain('E2E data cleanup failed')
  }
  finally {
    expect(dataRoot).toContain('hai-browser-e2e-')
    rmSync(dataRoot, { recursive: true, force: true })
  }
})

it('生成应用与仓库使用同一浏览器执行器行为', () => {
  expect(readFileSync(resolve('packages/cli/templates/shared/run-e2e.mjs'), 'utf8')).toBe(readFileSync(resolve('scripts/run-e2e.mjs'), 'utf8'))
})
