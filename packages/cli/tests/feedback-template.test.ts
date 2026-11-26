import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateConfigFile } from '../src/commands/cli-config-templates.js'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

describe('feedback 生成工程', () => {
  it.each(['api', 'fullstack'] as const)('%s 启用反馈时补齐数据库与认证依赖', (appType) => {
    const context = buildTemplateContext({
      name: 'feedback-sample',
      appType,
      features: ['feedback'],
      packageManager: 'pnpm',
    })
    expect(context.features.db).toBe(true)
    expect(context.features.iam).toBe(true)
    expect(context.haiCatalogPackages['@h-ai/feedback']).toBeDefined()
    expect(parse(generateConfigFile('feedback'))).toEqual({
      appId: expect.stringContaining('HAI_FEEDBACK_APPID:my-app'),
    })
  })

  it('生成完整的本人入口、处理列表及服务端接口', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-feedback-template-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({
        name: 'feedback-sample',
        appType: 'fullstack',
        frontends: ['web'],
        features: ['feedback'],
        packageManager: 'pnpm',
      }))
      const shared = path.join(directory, 'packages/feedback-sample-shared')
      const service = path.join(directory, 'packages/feedback-sample-serv')
      expect(await readFile(path.join(shared, 'src/lib/components/FeedbackEntry.svelte'), 'utf8')).toContain('actions={myFeedbackActions}')
      expect(await readFile(path.join(shared, 'src/lib/api/feedback-client.ts'), 'utf8')).toContain('reports.addMessage')
      expect(await readFile(path.join(shared, 'src/lib/pages/feedback.svelte'), 'utf8')).toContain('actions={staffFeedbackActions}')
      expect(await readFile(path.join(service, 'src/app-server.ts'), 'utf8')).toContain('apiContract.feedbackTransportRoutes(servConfig.http.apiPrefix, feedback.config?.limits.maxTotalFileBytes)')
      expect(await readFile(path.join(service, 'src/server/procedures/index.ts'), 'utf8')).toContain('scopeId: \'feedback-sample\'')
      expect(await readFile(path.join(service, 'config/_feedback.yml'), 'utf8')).toContain('HAI_FEEDBACK_APPID:feedback-sample')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['api', 'fullstack'] as const)('%s 的反馈入口通过生成工程的实际 lint 规则', async (appType) => {
    const directory = await mkdtemp(path.join(process.cwd(), '.tmp-feedback-quality-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({
        name: 'feedback-sample',
        appType,
        frontends: ['web'],
        features: ['feedback'],
        packageManager: 'pnpm',
      }))
      const eslint = new ESLint({
        cwd: directory,
        overrideConfigFile: path.join(directory, 'eslint.config.js'),
      })
      const paths = appType === 'api'
        ? [
            'e2e',
            'apps/feedback-sample-serv/src/app.ts',
            'apps/feedback-sample-serv/src/lib/server/init.ts',
            'apps/feedback-sample-serv/src/server/procedures/index.ts',
            'apps/feedback-sample-contract/src/feedback-sample-contract.ts',
          ]
        : [
            'e2e',
            'packages/feedback-sample-serv/src/app-server.ts',
            'packages/feedback-sample-serv/src/server/runtime.ts',
            'packages/feedback-sample-serv/src/server/procedures/index.ts',
            'packages/feedback-sample-contract/src/feedback-sample-contract.ts',
            'packages/feedback-sample-shared/src/lib/api/feedback-client.ts',
            'packages/feedback-sample-shared/src/lib/components/FeedbackEntry.svelte',
            'packages/feedback-sample-shared/src/lib/components/AdminWorkspace.svelte',
            'packages/feedback-sample-shared/src/lib/components/AppShell.svelte',
            'packages/feedback-sample-shared/src/lib/pages/feedback.svelte',
          ]
      const results = await eslint.lintFiles(paths)
      expect(results.flatMap(result => result.messages.filter(message => message.severity === 2).map(message => `${path.relative(directory, result.filePath)}:${message.line} ${message.ruleId} ${message.message}`))).toEqual([])
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
