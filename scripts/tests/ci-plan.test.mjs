import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { assertChecksPassed, assertLeakScanPassed, baselineFromChecks, canReuseStage, createStageProof, environmentFingerprint, stageFingerprint, stageIds } from '../../.github/scripts/ci-plan.mjs'

const base = [
  { path: 'packages/ui/src/button.ts', mode: '100644', object: 'a'.repeat(40) },
  { path: 'apps/admin-console/e2e/ui-gallery-scenes.spec.ts', mode: '100644', object: 'b'.repeat(40) },
  { path: 'apps/h5-app/e2e/app.spec.ts', mode: '100644', object: 'c'.repeat(40) },
  { path: '.github/workflows/ci.yml', mode: '100644', object: 'd'.repeat(40) },
]
const change = path => base.map(file => file.path === path ? { ...file, object: 'f'.repeat(40) } : file)
const fingerprint = stageFingerprint('unit', base)
const identity = { event: 'push', ref: 'refs/heads/main', repository: 'hai-series/hai-framework', sha: '1'.repeat(40), runId: 123, environment: 'e'.repeat(64) }
const proof = () => createStageProof({ ...identity, stage: 'unit', fingerprint })
const reusable = overrides => canReuseStage({ ...identity, stage: 'unit', fingerprint, baseline: { sha: identity.sha, stages: ['unit'] }, cacheHit: true, force: false, proof: proof(), ...overrides })

describe('ci 阶段输入与独立结果复用', () => {
  it('仅改 Admin 浏览器用例不使单元、类型与其他浏览器结果失效', () => {
    const updated = change('apps/admin-console/e2e/ui-gallery-scenes.spec.ts')
    for (const stage of ['unit', 'typecheck', 'contracts', 'scaffold', 'sdk', 'deploy', 'browser-h5-app'])
      expect(stageFingerprint(stage, updated)).toBe(stageFingerprint(stage, base))
    for (const stage of ['lint', 'browser-admin-console'])
      expect(stageFingerprint(stage, updated)).not.toBe(stageFingerprint(stage, base))
  })

  it.each(['packages/ui/src/button.ts', '.github/workflows/ci.yml'])('公共实现或流水线变化使所有检查失效：%s', (path) => {
    for (const stage of stageIds)
      expect(stageFingerprint(stage, change(path))).not.toBe(stageFingerprint(stage, base))
  })

  it('未知应用、共享 helper 和新增文件保守纳入验证，不按名称猜测无影响', () => {
    for (const path of ['apps/new-app/e2e/flow.spec.ts', 'apps/admin-console/e2e/helpers.ts', 'pnpm-lock.yaml']) {
      expect(stageFingerprint('unit', [...base, { path, mode: '100644', object: 'e'.repeat(40) }])).not.toBe(fingerprint)
    }
  })

  it('文件顺序不影响指纹，路径、内容及可执行权限变化均使结果失效', () => {
    expect(stageFingerprint('unit', [...base].reverse())).toBe(fingerprint)
    for (const altered of [{ path: 'packages/ui/src/renamed.ts' }, { mode: '100755' }, { object: 'e'.repeat(40) }])
      expect(stageFingerprint('unit', [{ ...base[0], ...altered }, ...base.slice(1)])).not.toBe(fingerprint)
    expect(() => stageFingerprint('unknown', base)).toThrow()
  })

  it('独立通过记录可复用，不要求该轮其他阶段也成功', () => {
    expect(reusable()).toBe(true)
  })

  it.each([
    { event: 'pull_request', ref: 'refs/pull/2/merge' },
    { ref: 'refs/heads/feature' },
    { force: true },
    { cacheHit: false },
    { proof: null },
    { proof: {} },
    { fingerprint: '2'.repeat(64) },
    { repository: 'other/repository' },
    { environment: '3'.repeat(64) },
    { baseline: null },
    { baseline: { sha: '2'.repeat(40), stages: ['unit'] } },
  ])('不可信来源、强制全量或缺失证据必须重新运行：%j', (overrides) => {
    expect(reusable(overrides)).toBe(false)
  })

  it('拒绝另一阶段、过期格式和不完整的来源记录', () => {
    for (const altered of [{ stage: 'lint' }, { schema: 0 }, { runId: 0 }, { sha: 'invalid' }, { event: 'pull_request' }])
      expect(reusable({ proof: { ...proof(), ...altered } })).toBe(false)
    expect(() => createStageProof({ ...identity, event: 'pull_request', stage: 'unit', fingerprint })).toThrow()
  })
})

describe('ci 基线最新检查', () => {
  const check = { head_sha: identity.sha, app: { slug: 'github-actions' }, name: 'Unit and container tests / Check unit', status: 'completed', conclusion: 'success' }
  const baseline = overrides => baselineFromChecks(identity.sha, { total_count: 1, check_runs: [{ ...check, ...overrides }] })

  it('只复用上次main头的独立成功阶段', () => {
    expect(reusable({ baseline: baseline() })).toBe(true)
  })

  it.each(['failure', 'cancelled', 'skipped', 'timed_out'])('最新%s不能被旧缓存通过遮蔽', (conclusion) => {
    expect(reusable({ baseline: baseline({ conclusion }) })).toBe(false)
  })

  it('检查未完成、来自其他应用或来源不匹配时重新执行', () => {
    for (const invalid of [{ status: 'in_progress' }, { app: { slug: 'other' } }, { head_sha: '2'.repeat(40) }])
      expect(reusable({ baseline: baseline(invalid) })).toBe(false)
  })

  it('aPI缺少完整证据时不复用', () => {
    for (const body of [null, { total_count: 100, check_runs: [] }, { total_count: 2, check_runs: [check] }])
      expect(reusable({ baseline: baselineFromChecks(identity.sha, body) })).toBe(false)
  })

  it('传递复用结果时保留原始执行来源', () => {
    const original = proof()
    const carried = createStageProof({ ...identity, sha: '2'.repeat(40), runId: 456, stage: 'unit', fingerprint, executionSha: original.sha, executionRunId: original.runId })
    expect(carried.sha).toBe('2'.repeat(40))
    expect(carried.executionSha).toBe(original.sha)
    expect(carried.executionRunId).toBe(123)
  })
})

describe('ci 环境边界', () => {
  const environment = { os: 'Linux', arch: 'X64', imageOS: 'ubuntu24', imageVersion: '20261029.1', nodeVersion: 'v24.22.1', day: '2026-10-29' }
  it.each(['arch', 'imageVersion', 'nodeVersion', 'day'])('环境或日期变化不能复用：%s', (field) => {
    expect(environmentFingerprint({ ...environment, [field]: 'changed' })).not.toBe(environmentFingerprint(environment))
  })
  it('缺失环境身份时不生成可复用键', () => {
    expect(environmentFingerprint({ ...environment, imageVersion: undefined })).toBeNull()
  })
})

describe('ci 最终汇总守卫', () => {
  const success = () => Object.fromEntries(['plan', 'build', 'lint', 'typecheck', 'contracts', 'unit', 'scaffold', 'sdk', 'deploy', 'browsers'].map(stage => [stage, { result: 'success' }]))

  it('所有必需阶段成功才允许发布', () => {
    expect(() => assertChecksPassed(success())).not.toThrow()
  })

  it.each(['failure', 'cancelled', 'skipped'])('不能把 %s 当作通过', (result) => {
    expect(() => assertChecksPassed({ ...success(), unit: { result } })).toThrow('unit')
  })

  it('缺少必需阶段时拒绝放行', () => {
    const results = success()
    delete results.deploy
    expect(() => assertChecksPassed(results)).toThrow('deploy')
  })

  it('后来加入的阶段失败也不能被旧必需列表忽略', () => {
    expect(() => assertChecksPassed({ ...success(), newGate: { result: 'failure' } })).toThrow('newGate')
  })
})

describe('ci 发布扫描门禁', () => {
  const scan = { head_sha: identity.sha, name: 'Scan Changed Content', app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }
  const body = altered => ({ total_count: 1, check_runs: [{ ...scan, ...altered }] })

  it('同一提交扫描成功才允许发布', () => {
    expect(() => assertLeakScanPassed(identity.sha, body())).not.toThrow()
  })
  it.each([{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' }, { head_sha: '2'.repeat(40) }, { app: { slug: 'other' } }])('拒绝失败、未完成或不匹配的扫描 %j', (altered) => {
    expect(() => assertLeakScanPassed(identity.sha, body(altered))).toThrow()
  })
  it('扫描缺失或列表不完整不能视为通过', () => {
    expect(() => assertLeakScanPassed(identity.sha, { total_count: 0, check_runs: [] })).toThrow()
    expect(() => assertLeakScanPassed(identity.sha, { ...body(), total_count: 2 })).toThrow()
  })
})

describe('ci 真实workflow依赖图', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
  const stage = parse(readFileSync(new URL('../../.github/workflows/ci-stage.yml', import.meta.url), 'utf8'))

  it('构建与lint独立，单元与重型E2E可在独立runner并行', () => {
    expect(workflow.jobs.build.needs).toBe('plan')
    expect(workflow.jobs.lint.needs).toBe('plan')
    expect(workflow.jobs.unit.needs).toEqual(['plan', 'build'])
    for (const job of ['scaffold', 'sdk', 'deploy', 'browsers']) {
      expect(workflow.jobs[job].needs).toEqual(expect.arrayContaining(['build', 'lint', 'typecheck', 'contracts']))
      expect(workflow.jobs[job].needs).not.toContain('unit')
      expect(workflow.jobs[job].uses).toBe('./.github/workflows/ci-stage.yml')
    }
    expect(workflow.jobs.browsers.strategy['fail-fast']).toBe(false)
  })

  it('浏览器矩阵覆盖全部已登记应用，最终汇总与发布没有绕过阶段', () => {
    expect(workflow.jobs.browsers.strategy.matrix.app.map(app => `browser-${app}`).sort()).toEqual(stageIds.filter(id => id.startsWith('browser-')).sort())
    const results = Object.fromEntries(workflow.jobs.quality.needs.map(job => [job, { result: 'success' }]))
    expect(() => assertChecksPassed(results)).not.toThrow()
    expect(workflow.jobs.quality.if).toBe('always()')
    expect(workflow.jobs.release.needs).toBe('quality')
  })

  it('通过记录精确恢复，写入限定可信main，命令失败不写入记录', () => {
    const steps = stage.jobs.check.steps
    const restore = steps.find(step => step.id === 'proof_cache')
    expect(restore.with['restore-keys']).toBeUndefined()
    expect(restore.if).toContain('github.event_name == \'push\'')
    const save = steps.find(step => step.uses?.startsWith('actions/cache/save@'))
    expect(save.if).toContain('success()')
    expect(save.if).toContain('github.ref == \'refs/heads/main\'')
    expect(steps.findIndex(step => step.name === 'Execute verification')).toBeLessThan(steps.indexOf(save))
    expect(restore.with.key).toContain('steps.environment.outputs.fingerprint')
  })
})
