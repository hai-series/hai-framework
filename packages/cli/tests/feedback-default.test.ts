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
  it('新工程包含反馈依赖、可信接口、界面和自动容量环境默认值', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-feedback-default-'))
    temporaryRoots.push(root)
    const name = 'default-feedback'
    await createProject({
      name,
      appType: 'fullstack',
      frontends: ['web'],
      defaults: true,
      install: false,
      git: false,
      packageManager: 'pnpm',
      cwd: root,
    })
    const directory = path.join(root, name)
    const service = `packages/${name}-serv`
    const shared = `packages/${name}-shared`
    const manifest: { dependencies: Record<string, string> } = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
    for (const dependency of [
      'feedback',
      'reach',
      'storage',
      'iam',
      'reldb',
      'cache',
      'crypto',
    ])
      expect(manifest.dependencies[`@h-ai/${dependency}`], dependency).toBe('catalog:')
    const config = parse(await readFile(path.join(directory, service, 'config/_feedback.yml'), 'utf8'))
    expect(config).toEqual({
      appId: expect.stringContaining('HAI_FEEDBACK_APPID:default-feedback'),
    })
    expect(parseEnv(await readFile(path.join(directory, '.env.example'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('auto')
    expect(parseEnv(await readFile(path.join(directory, '.env'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('auto')
    const procedures = await readFile(path.join(directory, service, 'src/server/procedures/index.ts'), 'utf8')
    expect(procedures).toContain('serv.createFeedbackProcedures(')
    expect(procedures).toContain(`scopeId: '${name}'`)
    const shell = await readFile(path.join(directory, shared, 'src/lib/components/AppShell.svelte'), 'utf8')
    expect(shell).toContain('<FeedbackEntry canSubmit=')
    expect(shell).toContain('m.nav_feedback()')
    expect(await readFile(path.join(directory, shared, 'src/lib/pages/feedback.svelte'), 'utf8')).toContain('<FeedbackList')
    // 默认工程只交付基础用例；深入的反馈场景由框架脚手架门禁安装并执行。
    const ordinaryTests = await readFile(path.join(directory, 'e2e/fullstack.spec.ts'), 'utf8')
    expect(ordinaryTests).toContain('application opens')
    expect(ordinaryTests).not.toContain('feedback exchanges attachments')
    const browserTests = await readFile(new URL('./fixtures/scenarios/fullstack.spec.ts.hbs', import.meta.url), 'utf8')
    expect(browserTests).toContain('feedback exchanges attachments')
    expect(browserTests).toContain('feedback-mine')
  })

  it('api 新工程也包含完整反馈能力与自动容量预算', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-feedback-api-default-'))
    temporaryRoots.push(root)
    const name = 'default-api'
    await createProject({
      name,
      appType: 'api',
      defaults: true,
      install: false,
      git: false,
      packageManager: 'pnpm',
      cwd: root,
    })
    const directory = path.join(root, name)
    const service = `apps/${name}-serv`
    const manifest: { dependencies: Record<string, string> } = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
    expect(manifest.dependencies['@h-ai/feedback']).toBe('catalog:')
    expect(parseEnv(await readFile(path.join(directory, service, '.env.example'), 'utf8')).HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES).toBe('auto')
    expect(await readFile(path.join(directory, service, 'src/server/procedures/index.ts'), 'utf8')).toContain('serv.createFeedbackProcedures(')
  })
})
