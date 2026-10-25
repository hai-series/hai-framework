import type { FeatureId } from '../src/cli-types.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'

const temporaryRoots: string[] = []

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const directory of temporaryRoots.splice(0))
    await rm(directory, { recursive: true, force: true })
})

describe('fullstack 默认反馈生成', () => {
  it('未指定 features 的新工程包含反馈依赖、可信接口、界面和实际 8 MiB 环境默认值', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-feedback-default-'))
    temporaryRoots.push(root)
    const name = 'default-feedback'
    await createProject({ name, appType: 'fullstack', frontends: ['web'], yes: true, examples: false, install: false, git: false, packageManager: 'pnpm', cwd: root })
    const directory = path.join(root, name)
    const service = `packages/${name}-serv`
    const shared = `packages/${name}-shared`
    const manifest: { dependencies: Record<string, string> } = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
    for (const dependency of ['feedback', 'reach', 'storage', 'iam', 'reldb', 'cache', 'crypto'])
      expect(manifest.dependencies[`@h-ai/${dependency}`], dependency).toBe('catalog:')
    const config = parse(await readFile(path.join(directory, service, 'config/_feedback.yml'), 'utf8'))
    expect(config).toMatchObject({ notificationMode: expect.stringContaining(':console'), recipients: [] })
    expect(parseEnv(await readFile(path.join(directory, '.env.example'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('8388608')
    expect(parseEnv(await readFile(path.join(directory, '.env'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('8388608')
    const procedures = await readFile(path.join(directory, service, 'src/server/procedures/index.ts'), 'utf8')
    expect(procedures).toContain('createFeedbackProcedures')
    expect(procedures).toContain(`scopeId: '${name}'`)
    const shell = await readFile(path.join(directory, shared, 'src/lib/components/AppShell.svelte'), 'utf8')
    expect(shell).toContain('<FeedbackEntry />')
    expect(shell).toContain('m.nav_feedback()')
    expect(await readFile(path.join(directory, shared, 'src/lib/pages/feedback.svelte'), 'utf8')).toContain('<FeedbackList')
    // 默认完整样板场景必须执行同一段真实截图、大日志上传和 ZIP 下载验收。
    const browserTests = await readFile(path.join(directory, 'e2e/fullstack.spec.ts'), 'utf8')
    expect(browserTests).toContain('feedback submits an empty description')
    expect(browserTests).toContain('attached-large-log.txt')
    expect(browserTests).toContain('getImageData(12, 12, 1, 1)')
    expect(browserTests).toContain('readFeedbackBundle')
  })

  it.each([
    { label: '显式空选择', features: [] as FeatureId[] },
    { label: '显式其它模块', features: ['ai'] as FeatureId[] },
  ])('$label 保留用户意图，不自动启用反馈', async ({ features }) => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-feedback-explicit-'))
    temporaryRoots.push(root)
    const name = 'explicit-features'
    await createProject({ name, appType: 'fullstack', frontends: ['web'], features, yes: true, examples: false, install: false, git: false, packageManager: 'pnpm', cwd: root })
    const directory = path.join(root, name)
    const service = `packages/${name}-serv`
    const manifest: { dependencies: Record<string, string> } = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
    expect(manifest.dependencies['@h-ai/feedback']).toBeUndefined()
    expect(parse(await readFile(path.join(directory, service, 'config/_feedback.yml'), 'utf8'))).toBeNull()
    expect(parseEnv(await readFile(path.join(directory, '.env.example'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('1048576')
    expect(await readFile(path.join(directory, `packages/${name}-shared/src/lib/components/AppShell.svelte`), 'utf8')).not.toContain('<FeedbackEntry />')
  })

  it('aPI 工程未指定 features 时保持原有默认模块，不全局启用反馈', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-feedback-api-default-'))
    temporaryRoots.push(root)
    const name = 'default-api'
    await createProject({ name, appType: 'api', yes: true, examples: false, install: false, git: false, packageManager: 'pnpm', cwd: root })
    const directory = path.join(root, name)
    const service = `apps/${name}-service`
    const manifest: { dependencies: Record<string, string> } = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
    expect(manifest.dependencies['@h-ai/feedback']).toBeUndefined()
    expect(parseEnv(await readFile(path.join(directory, service, '.env.example'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('1048576')
    expect(await readFile(path.join(directory, service, 'src/server/procedures/index.ts'), 'utf8')).not.toContain('createFeedbackProcedures')
  })
})
