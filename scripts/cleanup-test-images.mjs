/** 测试镜像定向回收；默认预览，禁止全局 prune 或强制删除。 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const TEST_IMAGE_OWNER_LABEL = 'org.h-ai.test.image-run'

function command(runtime, args) {
  return execFileSync(runtime, args, { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** 使用 inspect 的真实 tag；Podman ls 的 RepoTags 可能为空，且每个 alias 会重复一行。 */
export function inspectImages(runtime, run = command, owner) {
  const filter = owner ? ['--filter', `label=${TEST_IMAGE_OWNER_LABEL}=${owner}`] : []
  const ids = [...new Set(run(runtime, ['image', 'ls', '--all', '--quiet', '--no-trunc', ...filter]).trim().split(/\s+/).filter(Boolean))]
  const images = []
  for (let index = 0; index < ids.length; index += 64) {
    images.push(...JSON.parse(run(runtime, ['image', 'inspect', ...ids.slice(index, index + 64)])))
  }
  return images
}

/** 子镜像先于父镜像处理，--no-prune 保证不顺带删除账本外的父镜像。 */
export function imageRemovalOrder(images) {
  const byId = new Map(images.map(image => [image.Id.replace(/^sha256:/, ''), image]))
  const result = []
  const seen = new Set()
  function visit(image) {
    if (seen.has(image.Id))
      return
    seen.add(image.Id)
    for (const child of images) {
      if (child.Parent?.replace(/^sha256:/, '') === image.Id.replace(/^sha256:/, ''))
        visit(child)
    }
    result.push(image)
  }
  for (const image of byId.values())
    visit(image)
  return result
}

/** legacy 仅用于用户显式发起的历史回收；自动 teardown 必须给出本轮 owner 与 tag 账本。 */
export function cleanupTestImages({ runtime = 'podman', owner, imageRefs = [], legacy = false, apply = false, minAgeHours = 24, run = command, onProgress }) {
  if (!['podman', 'docker'].includes(runtime))
    throw new Error('Unsupported container runtime')
  if (!legacy && !/^[a-f0-9-]{36}$/.test(owner ?? ''))
    throw new Error('An explicit test image run ID is required')
  if (legacy && owner)
    throw new Error('Historical and current-run cleanup must be separate')
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0)
    throw new Error('Image minimum age must be a non-negative number')
  const report = { runtime, owner, legacy, apply, startedAt: new Date().toISOString(), candidates: [], removed: [], preserved: [], failures: [] }
  const cutoff = Date.now() - minAgeHours * 3600_000
  const refs = new Set(imageRefs)
  const images = inspectImages(runtime, run, owner)
  const candidates = images.filter((image) => {
    const tags = image.RepoTags ?? []
    if (legacy) {
      return !tags.length && Date.parse(image.Created) <= cutoff
        && (image.NamesHistory ?? []).some(name => /\/[a-f0-9]{64}-tmp:latest$/.test(name))
    }
    return (image.Config?.Labels ?? image.Labels)?.[TEST_IMAGE_OWNER_LABEL] === owner
      && (!tags.length || tags.some(tag => refs.has(tag)))
  })
  const ordered = imageRemovalOrder(candidates)
  const entryFor = image => ({ id: image.Id, tags: image.RepoTags ?? [], history: image.NamesHistory ?? [], size: image.Size, reason: legacy ? 'untagged-build-intermediate' : 'current-test-run' })
  report.candidates = ordered.map(entryFor)
  onProgress?.(report)
  const removals = apply ? ordered : []
  for (let index = 0; index < removals.length; index += 32) {
    const batch = removals.slice(index, index + 32)
    try {
      // 小批量复核与删除，避免 Windows 远程引擎为每个历史层启动两次客户端。
      const current = JSON.parse(run(runtime, ['image', 'inspect', ...batch.map(image => image.Id)]))
      const plans = []
      for (const image of batch) {
        const found = current.find(item => item.Id === image.Id)
        const tags = found?.RepoTags ?? []
        if (!found || (legacy ? tags.length > 0 : (found.Config?.Labels ?? found.Labels)?.[TEST_IMAGE_OWNER_LABEL] !== owner)
          || (!image.RepoTags?.length && tags.length)) {
          report.preserved.push({ ...entryFor(image), reason: 'ownership-changed' })
          continue
        }
        const targets = image.RepoTags?.length ? image.RepoTags.filter(tag => refs.has(tag) && tags.includes(tag)) : [image.Id]
        if (targets.length)
          plans.push({ ...entryFor(image), targets })
      }
      if (!plans.length)
        continue
      let detail
      try {
        // 仅显式 ID/tag；不强删、不隐式删父镜像。单项被占用不会阻止同批其他项。
        run(runtime, ['image', 'rm', '--no-prune', ...plans.flatMap(plan => plan.targets)])
      }
      catch (error) {
        detail = String(error.stderr ?? error.message ?? error).trim()
      }
      // 即使引擎返回非零也逐项核验，报告不把部分成功误写成全部失败。
      const remainingIds = new Set(run(runtime, ['image', 'ls', '--all', '--quiet', '--no-trunc']).trim().split(/\s+/).filter(Boolean).map(id => id.replace(/^sha256:/, '')))
      const survivors = plans.filter(plan => remainingIds.has(plan.id.replace(/^sha256:/, '')))
      const remaining = survivors.length ? JSON.parse(run(runtime, ['image', 'inspect', ...survivors.map(plan => plan.id)])) : []
      for (const plan of plans) {
        const found = remaining.find(image => image.Id === plan.id)
        if (plan.targets.every(target => target === plan.id ? !found : !found?.RepoTags?.includes(target))) {
          report.removed.push(plan)
        }
        else {
          const error = detail ?? 'Image removal was not confirmed'
          // 历史层仍被镜像、容器或 Buildah 引用时保留；自动清理的失败必须阻断门禁。
          const destination = legacy && /in use|used by|dependent|child images|referenced/i.test(error) ? report.preserved : report.failures
          destination.push({ ...plan, error })
        }
      }
    }
    catch (error) {
      const detail = String(error.stderr ?? error.message ?? error).trim()
      report.failures.push(...batch.map(image => ({ ...entryFor(image), error: detail })))
    }
    finally {
      onProgress?.(report)
    }
  }
  report.finishedAt = new Date().toISOString()
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  const output = resolve(value('--report') ?? `tmp/container-cleanup/${Date.now()}.json`)
  mkdirSync(dirname(output), { recursive: true })
  const report = cleanupTestImages({
    runtime: value('--runtime') ?? 'podman',
    legacy: args.includes('--legacy'),
    apply: args.includes('--apply'),
    minAgeHours: Number(value('--min-age-hours') ?? 24),
    onProgress: report => writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`),
  })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Test image cleanup: ${report.candidates.length} candidates, ${report.removed.length} removed, ${report.preserved.length} preserved, ${report.failures.length} failed. Report: ${output}\n`)
  if (report.failures.length)
    process.exitCode = 1
}
