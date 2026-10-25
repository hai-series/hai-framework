/** 显式启用的真实引擎回归：不拉镜像、不联网，验证 Vitest 退出后的资源状态。 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const enabled = process.env.HAI_TEST_IMAGE_SMOKE === '1'
const runtime = process.env.HAI_TEST_IMAGE_RUNTIME ?? 'podman'
const vitest = join(dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')
const setup = resolve('scripts/test-image-cleanup-setup.mjs')

it.skipIf(!enabled).each(['success', 'assertion-failure', 'build-failure', 'cleanup-failure', 'cancel', 'cancel-sigterm'])('真实引擎 %s 后执行全局 teardown，保留外部镜像', async (mode) => {
  const parent = resolve('tmp')
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(join(parent, 'image-cleanup-runtime-'))
  const control = `localhost/hai-cleanup-control:${randomUUID()}`
  const run = args => execFileSync(runtime, args, { encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
  let controlCreated = false
  try {
    writeFileSync(join(directory, 'Containerfile'), 'FROM scratch\nLABEL test.control=true\n')
    run(['build', '--pull=never', '-t', control, directory])
    controlCreated = true
    const controlId = JSON.parse(run(['image', 'inspect', control]))[0].Id
    writeFileSync(join(directory, 'payload'), 'test data')
    writeFileSync(join(directory, 'Containerfile'), `FROM scratch AS builder\nCOPY payload /payload\nFROM scratch\nCOPY --from=builder /payload /payload\n${mode === 'build-failure' ? 'COPY missing /missing\n' : ''}`)
    writeFileSync(join(directory, 'vitest.config.mjs'), `export default { test: { include: ['probe.test.mjs'], maxWorkers: 1, globalSetup: [${JSON.stringify(setup)}] } }`)
    writeFileSync(join(directory, 'probe.test.mjs'), `
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { it, expect } from 'vitest'
it('owned image build', async () => {
  const owner = process.env.HAI_TEST_IMAGE_RUN
  expect(owner).toMatch(/^[a-f0-9-]{36}$/)
  writeFileSync('owner.txt', owner)
  const imageRef = 'localhost/hai-cleanup-probe:' + owner
  appendFileSync(process.env.HAI_TEST_IMAGE_LEDGER, JSON.stringify({ runtime: ${JSON.stringify(runtime)}, imageRef }) + '\\n')
  const label = 'org.h-ai.test.image-run=' + owner
  execFileSync(${JSON.stringify(runtime)}, ['build', '--pull=never', '--label', label, ...(${JSON.stringify(runtime)} === 'podman' ? ['--layer-label', label, '--layers'] : []), '-t', imageRef, '.'], { windowsHide: true, stdio: 'pipe' })
  if (${JSON.stringify(mode)} === 'cleanup-failure')
    appendFileSync(process.env.HAI_TEST_IMAGE_LEDGER, JSON.stringify({ runtime: 'unavailable-engine', imageRef }) + '\\n')
  if (${JSON.stringify(mode)}.startsWith('cancel')) {
    process.stdout.write('image-ready\\n')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  expect(${JSON.stringify(mode)}).not.toBe('assertion-failure')
})
`)
    const result = mode.startsWith('cancel')
      ? await cancelVitest(directory, mode === 'cancel-sigterm' ? 'SIGTERM' : 'SIGINT')
      : spawnSync(process.execPath, [vitest, 'run'], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 120_000 })
    expect(result.error, result.stderr).toBeUndefined()
    if (mode.startsWith('cancel'))
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
    else
      expect(result.status, result.stdout + result.stderr).toBe(mode === 'success' ? 0 : 1)
    const owner = readFileSync(join(directory, 'owner.txt'), 'utf8')
    const reports = readdirSync(join(directory, 'test-results'))
    const report = JSON.parse(readFileSync(join(directory, 'test-results', reports[0]), 'utf8'))
    expect(report.reports[0].failures).toEqual([])
    if (mode === 'cleanup-failure')
      expect(report.reports[1].failures).toHaveLength(1)
    expect(report.reports[0].removed.length).toBeGreaterThan(0)
    expect(run(['image', 'ls', '--all', '--quiet', '--filter', `label=org.h-ai.test.image-run=${owner}`]).trim()).toBe('')
    expect(JSON.parse(run(['image', 'inspect', control]))[0].Id).toBe(controlId)
  }
  finally {
    if (controlCreated)
      run(['image', 'rm', '--no-prune', control])
    rmSync(directory, { recursive: true, force: true })
  }
}, 180_000)

/** Windows 不能向 Node 发送 POSIX 信号，通过宿主同一 SIGINT 处理器验证正常取消。 */
async function cancelVitest(directory, signal) {
  const script = `process.argv = [process.execPath, ${JSON.stringify(vitest)}, 'run']; process.stdin.once('data', () => { process.emit(${JSON.stringify(signal)}); process.stdin.destroy() }); await import(${JSON.stringify(pathToFileURL(vitest).href)})`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data) => {
    stdout += String(data)
    if (stdout.includes('image-ready') && !child.stdin.destroyed)
      child.stdin.end('cancel')
  })
  child.stderr.on('data', (data) => {
    stderr += String(data)
  })
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cancelled Vitest did not exit')), 120_000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (status) => {
        clearTimeout(timer)
        resolve({ status, stdout, stderr })
      })
    })
  }
  finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      else
        child.kill()
    }
  }
}
