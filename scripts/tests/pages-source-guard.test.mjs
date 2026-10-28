import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8'))
const step = workflow.jobs.prepare.steps.find(step => step.id === 'source_guard')
const script = step.run.split('\n').slice(1, -2).join('\n').replace('import { appendFileSync, readFileSync } from \'node:fs\'\n', '')
const trigger = {
  id: 10,
  workflow_id: 9,
  run_number: 1000,
  run_attempt: 1,
  head_repository: { full_name: 'owner/repo' },
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-29T00:00:00Z',
  updated_at: '2026-10-29T00:05:00Z',
}

async function execute(pages, current = trigger, status = 200) {
  const requests = []
  let output = ''
  await runInNewContext(`(async () => { ${script} })()`, {
    process: {
      env: { GITHUB_REPOSITORY: 'owner/repo', GITHUB_API_URL: 'https://api.github.com', GITHUB_EVENT_PATH: 'event.json', GITHUB_OUTPUT: 'output', PAGES_READ_TOKEN: 'fixture-token' },
      stdout: { write() {} },
    },
    readFileSync: () => JSON.stringify({ workflow_run: current }),
    appendFileSync: (_file, value) => { output += value },
    URLSearchParams,
    AbortSignal,
    fetch: async (url, options) => {
      requests.push({ url: new URL(url), options })
      return Response.json(pages[Math.min(requests.length - 1, pages.length - 1)], { status })
    },
  })
  return { publish: output.trim() === 'publish=true', requests }
}

describe('pages实际workflow来源guard', () => {
  it('最新成功来源发布，仅用同workflow/main/push/success与创建时间查询', async () => {
    const result = await execute([{ total_count: 1, workflow_runs: [trigger] }])
    expect(result.publish).toBe(true)
    expect(result.requests[0].url.pathname).toBe('/repos/owner/repo/actions/workflows/9/runs')
    expect(Object.fromEntries(result.requests[0].url.searchParams)).toMatchObject({ branch: 'main', event: 'push', status: 'success', created: `>=${trigger.created_at}`, per_page: '100' })
    expect(result.requests[0].options.redirect).toBe('error')
  })

  it('旧run重跑不能覆盖较新成功run，同秒创建也用run_number区分', async () => {
    const oldRetry = { ...trigger, run_attempt: 3, updated_at: '2026-11-01T00:00:00Z' }
    expect((await execute([{ total_count: 2, workflow_runs: [oldRetry, { ...trigger, id: 11, run_number: 1001 }] }], oldRetry)).publish).toBe(false)
  })

  it('仅main有sync bot提交不阻止当前成功来源，更新失败/pending或其他来源不算成功替代', async () => {
    const irrelevant = [
      { conclusion: 'failure' },
      { status: 'in_progress', conclusion: null },
      { head_repository: { full_name: 'fork/repo' } },
      { workflow_id: 99 },
      { event: 'pull_request' },
      { head_branch: 'feature' },
    ].map((fields, index) => ({ ...trigger, id: 20 + index, run_number: 1001 + index, ...fields }))
    expect((await execute([{ total_count: 1, workflow_runs: [trigger] }])).publish).toBe(true)
    expect((await execute([{ total_count: irrelevant.length, workflow_runs: irrelevant }])).publish).toBe(true)
  })

  it('跨仓库触发者直接跳过，不取得任何API结果', async () => {
    const result = await execute([], { ...trigger, head_repository: { full_name: 'fork/repo' } })
    expect(result.publish).toBe(false)
    expect(result.requests).toHaveLength(0)
  })

  it('不依赖第一页或API排序，第二页的更新成功run仍阻止旧来源', async () => {
    const older = Array.from({ length: 100 }, (_, index) => ({ ...trigger, id: 100 + index, run_number: 999 - index }))
    const result = await execute([
      { total_count: 101, workflow_runs: older },
      { total_count: 101, workflow_runs: [{ ...trigger, run_number: 1001 }] },
    ])
    expect(result.publish).toBe(false)
    expect(result.requests).toHaveLength(2)
    expect(result.requests[1].url.searchParams.get('page')).toBe('2')
  })

  it('aPI故障、列表截断和1000条搜索上限均失败关闭，不宣称可以发布', async () => {
    await expect(execute([{}], trigger, 503)).rejects.toThrow('HTTP 503')
    await expect(execute([{ total_count: 2, workflow_runs: [] }])).rejects.toThrow('incomplete')
    const fullPage = Array.from({ length: 100 }).fill(trigger)
    await expect(execute([{ total_count: 1000, workflow_runs: fullPage }])).rejects.toThrow('verification limit')
  })

  it('仅guard明确true才下载、重打包和部署，不增加checkout或写权限', () => {
    const artifactSteps = workflow.jobs.prepare.steps.filter(step => step.uses)
    expect(artifactSteps).toHaveLength(3)
    expect(artifactSteps.every(step => step.if === 'steps.source_guard.outputs.publish == \'true\'')).toBe(true)
    expect(workflow.jobs.prepare.permissions).toEqual({ contents: 'read', actions: 'read', pages: 'read' })
    expect(workflow.jobs.deploy.if).toBe('needs.prepare.outputs.publish == \'true\'')
    expect(workflow.jobs.deploy.permissions['id-token']).toBe('write')
  })
})
