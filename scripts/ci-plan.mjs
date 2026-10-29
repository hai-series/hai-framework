/** CI 以真实 Git 输入指纹复用独立通过记录；未知输入保守纳入所有阶段。 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const browserApps = ['admin-console', 'ai-playground', 'corporate-website', 'h5-app', 'mobile-app', 'framework-website']
export const stageIds = ['lint', 'typecheck', 'contracts', 'unit', 'scaffold', 'sdk', 'deploy', ...browserApps.map(app => `browser-${app}`)]
const requiredJobs = ['plan', 'build', 'lint', 'typecheck', 'contracts', 'unit', 'scaffold', 'sdk', 'deploy', 'browsers']
const digestPattern = /^[a-f\d]{64}$/
const shaPattern = /^[a-f\d]{40}$/

/** 同日、同runner镜像与实际Node版本才复用；缺少镜像身份时保守重跑。 */
export function environmentFingerprint({ os, arch, imageOS, imageVersion, nodeVersion, day }) {
  if (![os, arch, imageOS, imageVersion, nodeVersion, day].every(value => typeof value === 'string' && value.length > 0))
    return null
  return createHash('sha256').update(JSON.stringify({ os, arch, imageOS, imageVersion, nodeVersion, day })).digest('hex')
}

/** 只排除明确隔离于单元/类型检查的应用浏览器用例；helper、模板和未知应用均保留。 */
export function stageFingerprint(stage, files) {
  if (!stageIds.includes(stage))
    throw new Error(`Unknown CI stage: ${stage}`)
  const selected = files.filter((file) => {
    const match = /^apps\/([^/]+)\/e2e\/.+\.spec\.ts$/.exec(file.path)
    return !match || !browserApps.includes(match[1]) || stage === 'lint' || stage === `browser-${match[1]}`
  }).map(({ path, mode, object }) => ({ path, mode, object })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ schema: 1, stage, files: selected })).digest('hex')
}

/** 成功记录只由 main 推送写入，保存可追溯的来源；不包含环境值或测试数据。 */
export function createStageProof({ event, ref, repository, sha, runId, stage, fingerprint, environment, executionSha = sha, executionRunId = runId }) {
  if (event !== 'push' || ref !== 'refs/heads/main' || !stageIds.includes(stage)
    || !digestPattern.test(fingerprint) || !digestPattern.test(environment) || !shaPattern.test(sha)
    || !shaPattern.test(executionSha) || !Number.isSafeInteger(executionRunId) || executionRunId < 1
    || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !Number.isSafeInteger(runId) || runId < 1) {
    throw new Error('Invalid trusted CI stage identity')
  }
  return { schema: 1, event, ref, repository, sha, runId, stage, fingerprint, environment, executionSha, executionRunId }
}

/** 只接受基线提交的最新Actions检查；旧通过不能遮蔽后来失败、取消或仍在运行的同名检查。 */
export function baselineFromChecks(sha, body) {
  const empty = { sha: '', stages: [] }
  if (!shaPattern.test(sha) || !Array.isArray(body?.check_runs)
    || !Number.isSafeInteger(body.total_count) || body.total_count >= 100 || body.total_count !== body.check_runs.length) {
    return empty
  }
  const stages = stageIds.filter((stage) => {
    const name = `Check ${stage}`
    const checks = body.check_runs.filter(check => check?.head_sha === sha && check.app?.slug === 'github-actions'
      && (check.name === name || check.name?.endsWith(` / ${name}`)))
    return checks.length > 0 && checks.every(check => check.status === 'completed' && check.conclusion === 'success')
  })
  return { sha, stages }
}

/** 精确匹配才复用；PR、手工全量、缓存缺失/损坏均重新运行，不能由“文件看似无关”直接跳过。 */
export function canReuseStage({ event, ref, repository, stage, fingerprint, environment, baseline, force, cacheHit, proof }) {
  if (event !== 'push' || ref !== 'refs/heads/main' || force || !cacheHit || !proof)
    return false
  try {
    const valid = createStageProof(proof)
    return proof.schema === 1 && valid.repository === repository && valid.stage === stage
      && valid.fingerprint === fingerprint && valid.environment === environment
      && proof.executionSha === valid.executionSha && proof.executionRunId === valid.executionRunId
      && valid.sha === baseline?.sha && baseline?.stages?.includes(stage) === true
  }
  catch {
    return false
  }
}

/** 任一必需阶段失败、取消、跳过或缺失均拒绝发布；复用结果由阶段自身验证后返回成功。 */
export function assertChecksPassed(results) {
  const failed = [...new Set([...requiredJobs, ...Object.keys(results ?? {})])].filter(job => results?.[job]?.result !== 'success')
  if (failed.length)
    throw new Error(`Required CI stages did not succeed: ${failed.join(', ')}`)
}

/** 发布前核对同一提交的独立仓库扫描；不能由其他来源、旧提交或未完成的检查替代。 */
export function assertLeakScanPassed(sha, body) {
  const scans = body?.check_runs?.filter(check => check?.head_sha === sha && check.name === 'Scan Changed Content' && check.app?.slug === 'github-actions')
  if (!shaPattern.test(sha) || !Array.isArray(scans) || scans.length !== 1 || body.total_count !== body.check_runs.length
    || scans[0].status !== 'completed' || scans[0].conclusion !== 'success') {
    throw new Error('Repository leak scan has not succeeded for this commit')
  }
}

function identity() {
  return {
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    runId: Number(process.env.GITHUB_RUN_ID),
    stage: process.env.CI_STAGE,
    fingerprint: process.env.CI_FINGERPRINT,
    environment: process.env.CI_ENVIRONMENT,
  }
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT)
    throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

async function main() {
  if (process.argv[2] === 'leaks') {
    const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}/commits/${process.env.GITHUB_SHA}/check-runs?check_name=Scan%20Changed%20Content&filter=latest&per_page=100`, {
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache', 'X-GitHub-Api-Version': '2026-03-10' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok)
      throw new Error(`Unable to verify repository leak scan: HTTP ${response.status}`)
    assertLeakScanPassed(process.env.GITHUB_SHA, await response.json())
    process.stdout.write('Repository leak scan succeeded for this commit.\n')
    return
  }
  if (process.argv[2] === 'environment') {
    const fingerprint = environmentFingerprint({ os: process.env.RUNNER_OS, arch: process.env.RUNNER_ARCH, imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion, nodeVersion: process.version, day: new Date().toISOString().slice(0, 10) })
    output('fingerprint', fingerprint ?? '')
    if (!fingerprint)
      process.stdout.write('Result reuse disabled: runner image identity is unavailable.\n')
    return
  }
  if (process.argv[2] === 'plan') {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const tree = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 })
    const files = tree.split('\0').filter(Boolean).map((row) => {
      const match = /^(\d+) (?:blob|commit) ([a-f\d]+)\t(.+)$/s.exec(row)
      if (!match)
        throw new Error('Unrecognized Git tree entry')
      return { mode: match[1], object: match[2], path: match[3] }
    })
    output('fingerprints', JSON.stringify(Object.fromEntries(stageIds.map(stage => [stage, stageFingerprint(stage, files)]))))
    let baseline = { sha: '', stages: [] }
    // push.before是上次实际main头，支持一次推送多个提交；缺少API证据或重跑时不复用。
    if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main'
      && process.env.GITHUB_RUN_ATTEMPT === '1' && process.env.GITHUB_TOKEN && process.env.GITHUB_EVENT_PATH) {
      try {
        const { before } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
        if (shaPattern.test(before) && !/^0+$/.test(before)) {
          const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}/commits/${before}/check-runs?filter=latest&per_page=100`, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache', 'X-GitHub-Api-Version': '2026-03-10' },
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
          })
          if (!response.ok)
            throw new Error('Baseline lookup unavailable')
          baseline = baselineFromChecks(before, await response.json())
        }
      }
      catch {
        process.stdout.write('CI baseline evidence unavailable; verification stages will run.\n')
      }
    }
    output('baseline', JSON.stringify(baseline))
    output('base_sha', baseline.sha)
    return
  }
  if (process.argv[2] === 'aggregate') {
    assertChecksPassed(JSON.parse(process.env.CI_NEEDS ?? '{}'))
    process.stdout.write('All required CI stages have valid successful results.\n')
    return
  }
  const current = identity()
  if (!stageIds.includes(current.stage))
    throw new Error('CI_STAGE must name a known verification stage')
  const file = process.env.CI_PROOF_PATH || (process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP, 'hai-ci-proof', current.stage, 'proof.json'))
  if (!file)
    throw new Error('CI_PROOF_PATH is required')
  if (process.argv[2] === 'inspect') {
    let proof
    try {
      proof = JSON.parse(readFileSync(file, 'utf8'))
    }
    catch {
      proof = null
    }
    let baseline
    try {
      baseline = JSON.parse(process.env.CI_BASELINE ?? '{}')
    }
    catch {
      baseline = null
    }
    const reuse = canReuseStage({ ...current, baseline, cacheHit: process.env.CI_CACHE_HIT === 'true', force: process.env.CI_FORCE === 'true', proof })
    output('run', String(!reuse))
    output('execution_sha', reuse ? proof.executionSha : '')
    output('execution_run_id', reuse ? String(proof.executionRunId) : '')
    const message = reuse
      ? `Reusing ${current.stage}: identical inputs; source ${current.repository}/actions/runs/${proof.runId} at ${proof.sha}.`
      : `Running ${current.stage}: no matching trusted successful result, or a full run was requested.`
    process.stdout.write(`${message}\n`)
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`)
    return
  }
  if (process.argv[2] === 'record') {
    const proof = createStageProof({ ...current, executionSha: process.env.CI_EXECUTION_SHA || current.sha, executionRunId: Number(process.env.CI_EXECUTION_RUN_ID) || current.runId })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(proof))
    return
  }
  throw new Error('Expected plan, environment, inspect, record or aggregate')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
