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
import { createDeployFixtureCleanupReport, createDeployTestFixture, DEPLOY_FIXTURE_OWNER_LABEL, recordDeployTestImage, removeDeployTestFixture, removeDeployTestImages } from './helpers/deploy-container-fixture.js'

/** 引擎探测只用于测试前置；资源操作一律复用同一个被测 primitive。 */
function runtime(): DeployFixtureRuntime | undefined {
  for (const candidate of ['podman', 'docker'] as const) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore', windowsHide: true })
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
const fixtures = new Map<string, DeployTestFixture>()
const images = new Map<string, DeployTestImage>()
let directory: string
let sentinel: DeployTestFixture
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
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'hai-deploy-ownership-'))
    writeFileSync(path.join(directory, 'probe.mjs'), `import { createServer } from 'node:http'\nfor (const port of [22, 18080, 18081]) createServer((request, response) => response.end(process.env.HAI_DEPLOY_E2E_RUN)).listen(port, '0.0.0.0')\n`)
    writeFileSync(path.join(directory, 'Containerfile'), `FROM ${baseRef}\nCOPY probe.mjs /probe.mjs\nENTRYPOINT ["node", "/probe.mjs"]\n`)
    run(['build', ...(selected === 'podman' ? ['--http-proxy=false'] : []), '--label', `${DEPLOY_FIXTURE_OWNER_LABEL}=${scope}`, '-t', imageRef, '-f', path.join(directory, 'Containerfile'), directory])
    images.set(imageRef, recordDeployTestImage(selected!, imageRef, scope))
    baseImageId = run(['image', 'inspect', '--format', '{{.Id}}', baseRef])
    // control 的外部 tag 与本次 private tag 故意共享内容 ID，验证清理不会按 ID 强删。
    run(['tag', imageRef, foreignRef])
    images.set(foreignRef, recordDeployTestImage(selected!, foreignRef))
    sentinel = createDeployTestFixture(selected!, foreignRef, '', directory)
    fixtures.set(sentinel.containerId, sentinel)
    // 旧固定名称若已有外部所有者，只读记录；为空时由独立 control 创建并保存其 ID。
    try {
      legacyContainerId = run(['container', 'inspect', '--format', '{{.Id}}', 'hai-deploy-e2e-sshd'])
    }
    catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
      if (!/no such container|no container with name|no such object/i.test(stderr))
        throw error
      const id = run(['create', '--name', 'hai-deploy-e2e-sshd', '--label', `${DEPLOY_FIXTURE_OWNER_LABEL}=control-${scope}`, foreignRef])
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
    const a = createDeployTestFixture(selected!, imageRef, '', directory)
    fixtures.set(a.containerId, a)
    const b = createDeployTestFixture(selected!, imageRef, '', directory)
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
    writeFileSync(path.join(directory, 'Failed.Containerfile'), `FROM ${foreignRef}\nENTRYPOINT ["/hai-deploy-fixture-nonexistent-process"]\n`)
    run(['build', ...(selected === 'podman' ? ['--http-proxy=false'] : []), '-t', failedRef, '-f', path.join(directory, 'Failed.Containerfile'), directory])
    images.set(failedRef, recordDeployTestImage(selected!, failedRef))
    expect(() => createDeployTestFixture(selected!, failedRef, '', directory, failedRunId)).toThrow()
    expect(run(['ps', '-aq', '--filter', `label=${DEPLOY_FIXTURE_OWNER_LABEL}=${failedRunId}`])).toBe('')
    const collisionDirectory = path.join(directory, 'collision')
    mkdirSync(collisionDirectory)
    expect(() => createDeployTestFixture(selected!, foreignRef, '', collisionDirectory, sentinel.runId)).toThrow()
    expect(run(['container', 'inspect', '--format', '{{.Id}}', sentinel.containerId])).toBe(sentinel.containerId)
    expect(run(['container', 'inspect', '--format', '{{.State.Running}}', legacyContainerId])).toBe(legacyRunning)
    // tag 被另一个所有者重指向后，旧账本必须拒绝删除当前 tag。
    const replacedRef = `localhost/hai-deploy-e2e-retagged:${scope}`
    run(['tag', foreignRef, replacedRef])
    const previous = recordDeployTestImage(selected!, replacedRef)
    run(['tag', failedRef, replacedRef])
    const current = recordDeployTestImage(selected!, replacedRef)
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
})
