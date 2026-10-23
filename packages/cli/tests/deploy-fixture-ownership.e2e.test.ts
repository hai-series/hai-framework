/** 真实容器引擎验证部署夹具拥有权；不构建应用、不连接外部业务服务。 */
import type { DeployFixtureCleanupFailure, DeployFixtureRuntime, DeployTestFixture, DeployTestImage } from './helpers/deploy-container-fixture.js'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDeployFixtureCleanupReport, createDeployTestFixture, DEPLOY_FIXTURE_OWNER_LABEL, ensureDeployTestBaseImage, executeDeployTestFixture, recordDeployTestImage, removeDeployTestFixture, removeDeployTestImages } from './helpers/deploy-container-fixture.js'

/** 引擎探测只用于测试前置；资源操作一律复用同一个被测 primitive。 */
function runtime(): DeployFixtureRuntime | undefined {
  for (const candidate of ['podman', 'docker'] as const) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore', windowsHide: true, timeout: 15_000 })
      return candidate
    }
    catch { /* 尝试下一个实际引擎。 */ }
  }
  return undefined
}

const selected = runtime()
if (process.env.HAI_DEPLOY_E2E === '1' && !selected)
  throw new Error('Deployment ownership gate requires a reachable container engine')
const enabled = process.env.HAI_DEPLOY_E2E === '1' && selected !== undefined
const scope = randomBytes(16).toString('hex')
const imageRef = `localhost/hai-deploy-e2e-ownership:${scope}`
const foreignRef = `localhost/hai-deploy-e2e-foreign:${scope}`
const failedRef = `localhost/hai-deploy-e2e-failed-start:${scope}`
const mirror = process.env.HAI_DEPLOY_E2E_MIRROR
const baseRef = mirror ? `${mirror}/library/node:24.22.1-bookworm-slim` : 'node:24.22.1-bookworm-slim'
const otherBaseRef = mirror ? `${mirror}/library/python:3.11.17-slim-trixie` : 'python:3.11.17-slim-trixie'
const probe = `const{createServer}=require('node:http');const beats=new Map();for(const port of [22,18080,18081])createServer((request,response)=>{if(request.url.startsWith('/beat/')){if(request.method==='POST')beats.set(request.url,(beats.get(request.url)||0)+1);response.end(String(beats.get(request.url)||0));}else response.end(process.env.HAI_DEPLOY_E2E_RUN)}).listen(port,'0.0.0.0')`
const probeCommand = ['node', '-e', probe]
const fixtures = new Map<string, DeployTestFixture>()
const images = new Map<string, DeployTestImage>()
let directory: string
let sentinel: DeployTestFixture
let sentinelAddress: string
let baseImageId: string
let legacyContainerId: string
let legacyRunning: string
let controlOwnedLegacyId: string | undefined

function run(args: string[]): string {
  if (!selected)
    throw new Error('Deployment fixture runtime is unavailable')
  return execFileSync(selected, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }).trim()
}

/** 端口探针只读取当前夹具的 run 身份，不把其他进程的 HTTP 成功当作就绪。 */
async function expectReachable(fixture: DeployTestFixture): Promise<void> {
  for (const port of [fixture.sshHostPort, fixture.webHostPort, fixture.apiHostPort]) {
    let actual: string | undefined
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) })
        actual = await response.text()
        if (actual === fixture.runId)
          break
      }
      catch { /* 正在启动时继续检查同一已记录端口，不探测其他服务。 */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(actual).toBe(fixture.runId)
  }
}

describe.skipIf(!enabled)('部署夹具资源拥有权（真实引擎）', () => {
  beforeAll(async () => {
    const deadline = Date.now() + 120_000
    directory = mkdtempSync(path.join(tmpdir(), 'hai-deploy-ownership-'))
    ensureDeployTestBaseImage(selected!, baseRef, deadline - Date.now())
    ensureDeployTestBaseImage(selected!, otherBaseRef, deadline - Date.now())
    // 只给已存在的固定基础镜像增加本轮 tag，不创建可能在宿主超时后继续的 builder。
    run(['tag', baseRef, imageRef])
    images.set(imageRef, recordDeployTestImage(selected!, imageRef))
    baseImageId = run(['image', 'inspect', '--format', '{{.Id}}', baseRef])
    // control 的外部 tag 与本次 private tag 故意共享内容 ID，验证清理不会按 ID 强删。
    run(['tag', imageRef, foreignRef])
    images.set(foreignRef, recordDeployTestImage(selected!, foreignRef))
    sentinel = await createDeployTestFixture(selected!, foreignRef, '', directory, undefined, { command: probeCommand })
    fixtures.set(sentinel.containerId, sentinel)
    sentinelAddress = run(['container', 'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', sentinel.containerId])
    expect(sentinelAddress).toMatch(/^\d{1,3}(?:\.\d{1,3}){3}$/)
    // 旧固定名称若已有外部所有者，只读记录；为空时由独立 control 创建并保存其 ID。
    try {
      legacyContainerId = run(['container', 'inspect', '--format', '{{.Id}}', 'hai-deploy-e2e-sshd'])
    }
    catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
      if (!/no such container|no container with name|no such object/i.test(stderr))
        throw error
      const id = run(['create', '--pull=never', '--name', 'hai-deploy-e2e-sshd', '--label', `${DEPLOY_FIXTURE_OWNER_LABEL}=control-${scope}`, '--entrypoint', 'node', foreignRef, '-e', probe])
      if (!/^[a-f0-9]{64}$/i.test(id))
        throw new Error('Control sentinel create did not return a valid ID')
      controlOwnedLegacyId = id
      legacyContainerId = id
      run(['start', id])
    }
    legacyRunning = run(['container', 'inspect', '--format', '{{.State.Running}}', legacyContainerId])
  }, 300_000)

  afterAll(() => {
    const failures: DeployFixtureCleanupFailure[] = []
    const ownedContainers = [...fixtures.values(), ...(controlOwnedLegacyId ? [{ containerId: controlOwnedLegacyId, runId: scope }] : [])]
    const report = createDeployFixtureCleanupReport(scope, ownedContainers, images.values())
    if (selected) {
      for (const fixture of fixtures.values()) {
        try {
          removeDeployTestFixture(selected, fixture)
        }
        catch (error) {
          failures.push({ stage: 'container-remove', error })
        }
      }
      // control 只清自己成功 create 的 ID，不接管同名的外部资源。
      if (controlOwnedLegacyId) {
        try {
          run(['rm', '-f', controlOwnedLegacyId])
        }
        catch (error) {
          failures.push({ stage: 'control-container-remove', error })
        }
      }
      try {
        removeDeployTestImages(selected, [...images.values()].reverse())
      }
      catch (error) {
        failures.push({ stage: 'images-remove', error })
      }
      if (baseImageId) {
        try {
          expect(run(['image', 'inspect', '--format', '{{.Id}}', baseRef])).toBe(baseImageId)
        }
        catch (error) {
          failures.push({ stage: 'base-image-check', error })
        }
      }
    }
    try {
      report(failures)
    }
    catch (error) {
      failures.push({ stage: 'report-write', error })
    }
    try {
      if (directory)
        rmSync(directory, { recursive: true, force: true })
    }
    catch (error) {
      failures.push({ stage: 'temporary-directory-remove', error })
    }
    try {
      report(failures)
    }
    catch (error) {
      failures.push({ stage: 'report-write', error })
    }
    if (failures.length)
      throw new AggregateError(failures.map(failure => failure.error), 'Deployment ownership gate cleanup failed')
  }, 180_000)
  it('foreign sentinel与共享内容tag存活，双fixture宿主端口互不争用且关A不影响B', async () => {
    const a = await createDeployTestFixture(selected!, imageRef, '', directory, undefined, { command: probeCommand })
    fixtures.set(a.containerId, a)
    const b = await createDeployTestFixture(selected!, imageRef, '', directory, undefined, { command: probeCommand })
    fixtures.set(b.containerId, b)
    const ports = [a, b, sentinel].flatMap(fixture => [fixture.sshHostPort, fixture.webHostPort, fixture.apiHostPort])
    expect(new Set(ports).size).toBe(9)
    await Promise.all([expectReachable(a), expectReachable(b), expectReachable(sentinel)])
    expect(run(['container', 'inspect', '--format', '{{.Id}}', 'hai-deploy-e2e-sshd'])).toBe(legacyContainerId)
    expect(run(['container', 'inspect', '--format', '{{.State.Running}}', legacyContainerId])).toBe(legacyRunning)
    removeDeployTestFixture(selected!, a)
    fixtures.delete(a.containerId)
    await Promise.all([expectReachable(b), expectReachable(sentinel)])
    removeDeployTestFixture(selected!, b)
    fixtures.delete(b.containerId)
    const ownImage = images.get(imageRef)
    if (!ownImage)
      throw new Error('Missing owned image identity')
    removeDeployTestImages(selected!, [ownImage])
    images.delete(imageRef)
    expect(recordDeployTestImage(selected!, foreignRef).imageId).toBe(ownImage.imageId)
    expect(run(['container', 'inspect', '--format', '{{.Id}}', 'hai-deploy-e2e-sshd'])).toBe(legacyContainerId)
    await expectReachable(sentinel)
  }, 120_000)

  it('真实start失败回收已创建ID，create名称冲突不删除foreign容器', async () => {
    const failedRunId = randomBytes(16).toString('hex')
    run(['tag', otherBaseRef, failedRef])
    images.set(failedRef, recordDeployTestImage(selected!, failedRef))
    await expect(createDeployTestFixture(selected!, failedRef, '', directory, failedRunId, { command: ['/hai-deploy-fixture-nonexistent-process'] })).rejects.toThrow()
    expect(run(['ps', '-aq', '--filter', `label=${DEPLOY_FIXTURE_OWNER_LABEL}=${failedRunId}`])).toBe('')
    const collisionDirectory = path.join(directory, 'collision')
    mkdirSync(collisionDirectory)
    await expect(createDeployTestFixture(selected!, foreignRef, '', collisionDirectory, sentinel.runId, { command: probeCommand })).rejects.toThrow()
    expect(run(['container', 'inspect', '--format', '{{.Id}}', sentinel.containerId])).toBe(sentinel.containerId)
    expect(run(['container', 'inspect', '--format', '{{.State.Running}}', legacyContainerId])).toBe(legacyRunning)
    // tag 被另一个所有者重指向后，旧账本必须拒绝删除当前 tag。
    const replacedRef = `localhost/hai-deploy-e2e-retagged:${scope}`
    run(['tag', foreignRef, replacedRef])
    const previous = recordDeployTestImage(selected!, replacedRef)
    run(['tag', failedRef, replacedRef])
    const current = recordDeployTestImage(selected!, replacedRef)
    expect(current.imageId).not.toBe(previous.imageId)
    images.set(replacedRef, current)
    expect(() => removeDeployTestImages(selected!, [previous])).toThrow()
    expect(recordDeployTestImage(selected!, replacedRef).imageId).toBe(current.imageId)
    await expectReachable(sentinel)
  }, 120_000)

  it('清理失败只保留仓库内安全元数据，私有临时工程仍删除', () => {
    const reportRun = randomBytes(16).toString('hex')
    const privateRoot = mkdtempSync(path.join(tmpdir(), 'hai-deploy-private-cleanup-'))
    const privateKey = 'test-only-private-key-content'
    const privateToken = 'test-only-private-token-value'
    const reportDirectory = fileURLToPath(new URL('../../../tmp/validation/module-review/VERIFY-05/', import.meta.url))
    const report = createDeployFixtureCleanupReport(reportRun, [sentinel], images.values())
    writeFileSync(path.join(privateRoot, 'id_ed25519'), privateKey)
    writeFileSync(path.join(privateRoot, '.env.local'), `TOKEN=${privateToken}\n`)
    const failures: DeployFixtureCleanupFailure[] = [{ stage: 'images-remove', error: new AggregateError([new Error(`${privateKey} ${privateToken} ${privateRoot}`)], 'Test cleanup failure') }]
    try {
      report(failures)
    }
    finally {
      rmSync(privateRoot, { recursive: true, force: true })
    }
    report(failures)
    expect(existsSync(privateRoot)).toBe(false)
    const reports = readdirSync(reportDirectory).filter(name => name.startsWith(`${reportRun}-`) && name.endsWith('.json'))
    expect(reports).toHaveLength(1)
    const metadata = readFileSync(path.join(reportDirectory, reports[0]!), 'utf8')
    for (const secret of [privateKey, privateToken, privateRoot])
      expect(metadata).not.toContain(secret)
    expect(JSON.parse(metadata)).toMatchObject({ runId: reportRun, errors: [{ stage: 'images-remove', kind: 'aggregate-error' }] })
  })

  it.each(['timeout', 'error', 'abort'] as const)('准备 %s 后 owned 父子进程实际停止，外部 sentinel 保持可用', async (mode) => {
    const runId = randomBytes(16).toString('hex')
    const controller = new AbortController()
    let createdId: string | undefined
    let unexpected: DeployTestFixture | undefined
    let preparationStarted = false
    let failure: unknown
    const heartbeat = `http://127.0.0.1:${sentinel.sshHostPort}/beat/${runId}`
    // Fetch 禁止 SSH 的 22 端口；使用同一 sentinel 的 HTTP 18080 端口。
    const remote = `http://${sentinelAddress}:18080/beat/${runId}`
    const counts = async (): Promise<number[]> => await Promise.all(['parent', 'child'].map(async kind => Number(await (await fetch(`${heartbeat}/${kind}`, { signal: AbortSignal.timeout(2000) })).text())))
    try {
      try {
        // 第六参数在旧工厂中被忽略；Red 必须因准备/取消保护缺失而失败。
        unexpected = await createDeployTestFixture(selected!, foreignRef, '', directory, runId, {
          command: probeCommand,
          signal: controller.signal,
          prepare: async (fixture: DeployTestFixture, signal: AbortSignal | undefined) => {
            preparationStarted = true
            createdId = fixture.containerId
            const beat = (kind: string): string => `setInterval(()=>fetch(${JSON.stringify(`${remote}/${kind}`)},{method:'POST'}).catch(()=>{}),30)`
            // detached 在 Linux 使子进程 setsid，证明取消并非仅碰巧停止原父链。
            const source = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(beat('child'))}],{detached:true,stdio:'ignore'}).unref();${beat('parent')}`
            const running = executeDeployTestFixture(selected!, fixture, ['node', '-e', source], { timeoutMs: mode === 'timeout' ? 5000 : 20_000, signal })
            // 立即观察拒绝，避免故意取消在等待心跳时成为未处理的 rejection。
            const outcome = running.then(() => undefined, error => error)
            await expect.poll(async () => (await counts()).every(value => value > 2), { timeout: 4000 }).toBe(true)
            if (mode === 'abort') {
              controller.abort()
            }
            else if (mode === 'error') {
              controller.abort()
            }
            const error = await outcome
            const before = (await counts())[1]!
            await new Promise(resolve => setTimeout(resolve, 150))
            expect((await counts())[1]!).toBeGreaterThan(before)
            if (mode === 'error')
              throw new Error('Injected preparation failure after remote children started')
            if (error)
              throw error
            throw new Error('The long-running preparation unexpectedly completed')
          },
        })
      }
      catch (error) {
        failure = error
      }
      expect(preparationStarted).toBe(true)
      expect(failure).toBeInstanceOf(Error)
      expect(String(failure)).toContain(mode === 'error' ? 'Injected preparation failure' : mode === 'abort' ? 'aborted' : 'timeout')
      expect(createdId).toMatch(/^[a-f0-9]{64}$/i)
      expect(run(['container', 'ls', '-aq', '--no-trunc', '--filter', `id=${createdId}`])).toBe('')
      await new Promise(resolve => setTimeout(resolve, 250))
      const stopped = await counts()
      expect(stopped.every(value => value > 2)).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 350))
      expect(await counts()).toEqual(stopped)
      await expectReachable(sentinel)
      const evidence = fileURLToPath(new URL('../../../tmp/validation/module-review/VERIFY-06/', import.meta.url))
      mkdirSync(evidence, { recursive: true })
      writeFileSync(path.join(evidence, `prepare-${runId}.json`), JSON.stringify({ mode, runId, removedContainerId: createdId, externalSentinelId: sentinel.containerId, detachedChildContinuedAfterClientClose: true, stoppedHeartbeats: stopped, sentinelReachable: true }))
    }
    finally {
      controller.abort()
      if (unexpected)
        removeDeployTestFixture(selected!, unexpected)
    }
  }, 60_000)

  it('预先取消不创建容器或 cidfile，外部 sentinel 不受影响', async () => {
    const runId = randomBytes(16).toString('hex')
    const controller = new AbortController()
    controller.abort()
    await expect(createDeployTestFixture(selected!, foreignRef, '', directory, runId, { signal: controller.signal })).rejects.toThrow('aborted before create')
    expect(existsSync(path.join(directory, `fixture-${runId}.cid`))).toBe(false)
    expect(run(['container', 'ls', '-aq', '--filter', `label=${DEPLOY_FIXTURE_OWNER_LABEL}=${runId}`])).toBe('')
    await expectReachable(sentinel)
  })
})
