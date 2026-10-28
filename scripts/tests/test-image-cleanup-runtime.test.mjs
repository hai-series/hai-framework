/** 显式启用的真实引擎回归：不拉镜像、不联网，验证 Vitest 退出后的资源状态。 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { windowsTestCommand, windowsTestJobProbe } from '../test-command-windows.js'

const enabled = process.env.HAI_TEST_IMAGE_SMOKE === '1'
const runtime = process.env.HAI_TEST_IMAGE_RUNTIME ?? 'podman'
const vitest = join(dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')
const setup = resolve('scripts/test-image-cleanup-setup.mjs')

it.skipIf(!enabled).each(['success', 'assertion-failure', 'build-failure', 'cleanup-failure', 'cancel', 'cancel-sigterm'])('真实引擎 %s 后执行全局 teardown，保留外部镜像', async (mode) => {
  const parent = resolve('tmp')
  mkdirSync(parent, { recursive: true })
  const control = `localhost/hai-cleanup-control:${randomUUID()}`
  const evidence = createRuntimeEvidence(mode, control)
  const directory = mkdtempSync(join(parent, 'image-cleanup-runtime-'))
  const run = args => execFileSync(runtime, args, { encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
  let controlCreated = false
  try {
    writeFileSync(join(directory, 'Containerfile'), 'FROM scratch\nLABEL test.control=true\n')
    run(['build', '--pull=never', '-t', control, directory])
    controlCreated = true
    const controlId = JSON.parse(run(['image', 'inspect', control]))[0].Id
    appendFileSync(evidence.ledger, `${JSON.stringify({ mode, runtime, role: 'control', stage: 'built', owner: null, imageRef: control, imageId: controlId, recordedAt: new Date().toISOString() })}\n`)
    writeFileSync(join(directory, 'payload'), 'test data')
    writeFileSync(join(directory, 'Containerfile'), `FROM scratch AS builder\nCOPY payload /payload\nFROM scratch\nCOPY --from=builder /payload /payload\n${mode === 'build-failure' ? 'COPY missing /missing\n' : ''}`)
    writeFileSync(join(directory, 'vitest.config.mjs'), `export default { test: { include: ['probe.test.mjs'], maxWorkers: 1, globalSetup: [${JSON.stringify(setup)}] } }`)
    writeFileSync(join(directory, 'probe.test.mjs'), `
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { it, expect } from 'vitest'
it('owned image build', async () => {
  const owner = process.env.HAI_TEST_IMAGE_RUN
  expect(owner).toMatch(/^[a-f0-9-]{36}$/)
  writeFileSync('owner.txt', owner)
  const imageRef = 'localhost/hai-cleanup-probe:' + owner
  const evidence = ${JSON.stringify(evidence.ledger)}
  const record = (stage, values = {}) => appendFileSync(evidence, JSON.stringify({ mode: ${JSON.stringify(mode)}, runtime: ${JSON.stringify(runtime)}, role: 'owned', stage, owner, imageRef, imageId: null, recordedAt: new Date().toISOString(), ...values }) + '\\n')
  record('before-build')
  appendFileSync(process.env.HAI_TEST_IMAGE_LEDGER, JSON.stringify({ runtime: ${JSON.stringify(runtime)}, imageRef }) + '\\n')
  const label = 'org.h-ai.test.image-run=' + owner
  let buildError
  try {
    execFileSync(${JSON.stringify(runtime)}, ['build', '--pull=never', '--label', label, ...(${JSON.stringify(runtime)} === 'podman' ? ['--layer-label', label, '--layers'] : []), '-t', imageRef, '.'], { windowsHide: true, stdio: 'pipe' })
  }
  catch (error) { buildError = error }
  const inspected = spawnSync(${JSON.stringify(runtime)}, ['image', 'inspect', imageRef], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  let imageId = null
  let inspectionError = inspected.error?.message
  if (inspected.status === 0) {
    try { imageId = JSON.parse(inspected.stdout)[0]?.Id ?? null }
    catch (error) { inspectionError = error.message }
  }
  record(buildError ? 'build-failed' : 'built', { imageId, inspectStatus: inspected.status, inspectionError, buildStatus: buildError ? buildError.status ?? null : 0 })
  if (buildError) throw buildError
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
    writeFileSync(join(evidence.directory, 'child-result.json'), `${JSON.stringify({ status: result.status, signal: result.signal ?? null, error: result.error?.message ?? null }, null, 2)}\n`)
    writeFileSync(join(evidence.directory, 'stdout.log'), result.stdout ?? '')
    writeFileSync(join(evidence.directory, 'stderr.log'), result.stderr ?? '')
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
  catch (error) {
    writeFileSync(join(evidence.directory, 'failure.json'), `${JSON.stringify({ message: error.message, stack: error.stack }, null, 2)}\n`)
    throw error
  }
  finally {
    try {
      preserveRuntimeEvidence(directory, evidence.directory)
    }
    finally {
      try {
        if (controlCreated)
          run(['image', 'rm', '--no-prune', control])
      }
      finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  }
}, 180_000)

it('镜像身份与原始报告在本轮临时目录删除后仍可定位，不依赖容器', () => {
  mkdirSync(resolve('tmp'), { recursive: true })
  const directory = mkdtempSync(join(resolve('tmp'), 'image-evidence-unit-'))
  const owner = randomUUID()
  const imageRef = `localhost/hai-cleanup-probe:${owner}`
  const imageId = `sha256:${'a'.repeat(64)}`
  const evidence = createRuntimeEvidence('metadata-unit', imageRef)
  const report = { owner, builds: [{ runtime, imageRef }], reports: [{ failures: [{ error: 'synthetic cleanup failure' }] }] }
  try {
    appendFileSync(evidence.ledger, `${JSON.stringify({ mode: 'metadata-unit', runtime, role: 'owned', owner, imageRef, imageId })}\n`)
    writeFileSync(join(directory, 'owner.txt'), owner)
    mkdirSync(join(directory, 'test-results'))
    writeFileSync(join(directory, 'test-results', `image-cleanup-${owner}.json`), JSON.stringify(report))
    preserveRuntimeEvidence(directory, evidence.directory)
    rmSync(directory, { recursive: true, force: true })
    expect(existsSync(directory)).toBe(false)
    const events = readFileSync(evidence.ledger, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(events[0]).toMatchObject({ mode: 'metadata-unit', role: 'control', imageRef, imageId: null })
    expect(events[1]).toMatchObject({ mode: 'metadata-unit', owner, imageRef, imageId })
    expect(readFileSync(join(evidence.directory, 'owner.txt'), 'utf8')).toBe(owner)
    expect(JSON.parse(readFileSync(join(evidence.directory, 'test-results', `image-cleanup-${owner}.json`), 'utf8'))).toEqual(report)
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
    rmSync(evidence.directory, { recursive: true, force: true })
  }
})

/** 先记录精确候选引用；owner/实际 ID 由实际构建方追加，不靠事后全局枚举认领。 */
function createRuntimeEvidence(mode, imageRef) {
  const parent = resolve('tmp/validation/test-image-cleanup-runtime')
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const directory = join(parent, `${mode}-${randomUUID()}`)
  mkdirSync(directory, { mode: 0o700 })
  const ledger = join(directory, 'images.jsonl')
  writeFileSync(ledger, `${JSON.stringify({ mode, runtime, role: 'control', stage: 'before-build', owner: null, imageRef, imageId: null, recordedAt: new Date().toISOString() })}\n`, { mode: 0o600 })
  return { directory, ledger }
}

/** 保留原始 owner 与 teardown 报告，不能把缺报告或失败报告改写为清理成功。 */
function preserveRuntimeEvidence(directory, evidenceDirectory) {
  if (existsSync(join(directory, 'owner.txt')))
    copyFileSync(join(directory, 'owner.txt'), join(evidenceDirectory, 'owner.txt'))
  const reports = join(directory, 'test-results')
  if (existsSync(reports)) {
    mkdirSync(join(evidenceDirectory, 'test-results'), { recursive: true })
    for (const entry of readdirSync(reports, { withFileTypes: true })) {
      if (entry.isFile() && /^image-cleanup-[a-f0-9-]{36}\.json$/.test(entry.name))
        copyFileSync(join(reports, entry.name), join(evidenceDirectory, 'test-results', entry.name))
    }
  }
}

it.each(['SIGINT', 'SIGTERM'])('取消宿主等待 %s 处理完成及实际退出，不依赖容器', async (signal) => {
  mkdirSync(resolve('tmp'), { recursive: true })
  const directory = mkdtempSync(join(resolve('tmp'), 'image-cancel-process-'))
  const entry = join(directory, 'cancel-probe.mjs')
  writeFileSync(entry, `
const timer = setInterval(() => {}, 1000)
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  clearInterval(timer)
  process.stdout.write('cancelled:' + signal + '\\n')
  process.exitCode = 7
})
process.stdout.write('image-ready\\n')
`)
  try {
    const result = await cancelVitest(directory, signal, entry, 10_000)
    expect(result.status, result.stdout + result.stderr).toBe(7)
    expect(result.stdout).toContain(`cancelled:${signal}`)
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 15_000)

it('取消宿主忽略通知时按持有句柄结束并等待退出，不依赖容器', async () => {
  mkdirSync(resolve('tmp'), { recursive: true })
  const directory = mkdtempSync(join(resolve('tmp'), 'image-cancel-process-'))
  const entry = join(directory, 'cancel-probe.mjs')
  const ready = join(directory, 'ready')
  writeFileSync(entry, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(ready)}, 'ready'); process.stdout.write('image-ready\\n'); setInterval(() => {}, 1000)`)
  try {
    await expect(cancelVitest(directory, 'SIGINT', entry, 10_000)).rejects.toThrow('Cancelled Vitest did not exit')
    expect(readFileSync(ready, 'utf8')).toBe('ready')
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 15_000)

/** Windows 通过同一宿主 SIGINT/SIGTERM 处理器取消，超时只结束本次持有的进程句柄及 Job。 */
async function cancelVitest(directory, signal, entry = vitest, timeoutMs = 120_000) {
  const script = `process.argv = [process.execPath, ${JSON.stringify(entry)}, 'run']; process.stdin.once('data', () => { process.emit(${JSON.stringify(signal)}); process.stdin.destroy() }); await import(${JSON.stringify(pathToFileURL(entry).href)})`
  const args = ['--input-type=module', '-e', script]
  const job = process.platform === 'win32' ? windowsTestCommand(process.execPath, args) : undefined
  const child = spawn(job ? 'powershell.exe' : process.execPath, job?.args ?? args, { cwd: directory, env: { ...process.env, ...job?.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const deadline = performance.now() + timeoutMs
  let stdout = ''
  let stderr = ''
  let closed = false
  let notified = false
  let spawnError
  let inputError
  const completion = new Promise((resolve) => {
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('close', (status) => {
      closed = true
      resolve(status)
    })
  })
  child.stdin.on('error', (error) => {
    inputError = error
  })
  child.stdout.on('data', (data) => {
    stdout += String(data)
    if (stdout.includes('image-ready') && !notified && !child.stdin.destroyed) {
      notified = true
      child.stdin.end('cancel')
    }
  })
  child.stderr.on('data', (data) => {
    stderr += String(data)
  })
  let timer
  let result
  let failure
  try {
    // 从原总期限中预留退出核验时间，不能增加取消场景的工作期限。
    const status = await Promise.race([completion, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Cancelled Vitest did not exit')), Math.max(1, timeoutMs - Math.min(10_000, timeoutMs / 2)))
    })])
    if (spawnError || inputError)
      throw spawnError ?? inputError
    result = { status, stdout, stderr }
  }
  catch (error) {
    failure = error
  }
  clearTimeout(timer)
  try {
    const cleanupDeadline = Math.min(deadline, performance.now() + 10_000)
    // Windows 关闭本次 Job owner 的持有句柄，KILL_ON_JOB_CLOSE 回收成员；不按可复用 PID 查找进程。
    if (!closed)
      child.kill('SIGKILL')
    let closeTimer
    try {
      await Promise.race([completion, new Promise((resolve, reject) => {
        closeTimer = setTimeout(() => reject(new Error('Cancelled Vitest process exit was not confirmed')), Math.max(1, cleanupDeadline - performance.now()))
      })])
    }
    finally {
      clearTimeout(closeTimer)
    }
    if (job) {
      const probe = spawnSync('powershell.exe', windowsTestJobProbe(job.name), { windowsHide: true, stdio: 'ignore', timeout: Math.max(1, Math.floor(cleanupDeadline - performance.now())) })
      if (probe.error || probe.status !== 0)
        throw new Error('Cancelled Vitest job exit was not confirmed', { cause: probe.error })
    }
  }
  catch (error) {
    if (failure)
      throw new AggregateError([failure, error], 'Cancelled Vitest cleanup failed')
    throw error
  }
  if (failure)
    throw failure
  return result
}
