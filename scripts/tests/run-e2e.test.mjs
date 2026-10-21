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
fs.mkdirSync('test-results', {recursive:true})
fs.mkdirSync('playwright-report', {recursive:true})
fs.writeFileSync('test-results/screenshot.png', 'test')
fs.writeFileSync('playwright-report/index.html', 'test')
fs.writeFileSync(process.env.HAI_E2E_DATA_ROOT + '/test.db', 'test data')
fs.writeFileSync('data-root.txt', process.env.HAI_E2E_DATA_ROOT)
fs.appendFileSync('runs.txt', JSON.stringify(process.argv.slice(2)) + '\\n')
if (process.argv.includes('--wait')) {
  process.stdout.write('ready\\n')
  setInterval(() => {}, 1000)
}
else {
  process.exit(process.argv.includes('--fail') ? 7 : 0)
}
`)
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

it.each([0, 7])('测试退出 %s 后清理截图和报告，并保留退出码', (code) => {
  const result = spawnSync(process.execPath, [resolve('scripts/run-e2e.mjs'), ...(code ? ['--fail'] : [])], { cwd: directory })
  expect(result.status).toBe(code)
  expect(existsSync(join(directory, 'test-results'))).toBe(false)
  expect(existsSync(join(directory, 'playwright-report'))).toBe(false)
  expect(existsSync(join(directory, 'package.json'))).toBe(true)
  expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
})
it('顺序运行多个配置，失败后不再执行后续组并清理产物', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/run-e2e.mjs'), '--config', 'first.ts', '--next', '--fail', '--next', '--config', 'last.ts'], { cwd: directory })
  expect(result.status).toBe(7)
  const runs = readFileSync(join(directory, 'runs.txt'), 'utf8')
  expect(runs).toContain('first.ts')
  expect(runs).not.toContain('last.ts')
  expect(existsSync(join(directory, 'test-results'))).toBe(false)
  expect(existsSync(readFileSync(join(directory, 'data-root.txt'), 'utf8'))).toBe(false)
})

it('取消时结束测试进程并清理已写入的报告', async () => {
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
    expect(existsSync(join(directory, 'test-results'))).toBe(false)
    expect(existsSync(join(directory, 'playwright-report'))).toBe(false)
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
