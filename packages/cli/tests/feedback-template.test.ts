import type { CreateServContext } from '../../serv/src/serv-context.js'
import type { FeatureId } from '../src/cli-types.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { ESLint } from 'eslint'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { buildAuthContextFactory } from '../../serv/src/serv-context.js'
import { generateConfigFile } from '../src/commands/cli-config-templates.js'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

describe('feedback 生成工程', () => {
  it.each(['api', 'fullstack'] as const)('%s 选择 feedback 补齐持久化、附件和认证依赖', (appType) => {
    const context = buildTemplateContext({ name: 'feedback-sample', appType, features: ['feedback' as FeatureId], packageManager: 'pnpm' })
    expect(context.features.db).toBe(true)
    expect(context.features.storage).toBe(true)
    expect(context.features.reach).not.toBe(true)
    expect(context.features.iam).toBe(true)
    expect(context.haiCatalogPackages['@h-ai/feedback']).toBeDefined()
  })

  it('反馈配置具有管理员通知入口且不包含真实凭据', () => {
    const yaml = generateConfigFile('feedback')
    expect(yaml).toContain('recipients:')
    expect(yaml).toContain('notificationProvider:')
    expect(yaml).toContain('adminUrl:')
  })

  it.each([false, true])('原生反馈保存按功能开关隔离依赖和权限，启用=%s', async (enabled) => {
    const directory = await mkdtemp(path.join(process.cwd(), '.tmp-native-feedback-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({ name: 'native-feedback', appType: 'fullstack', frontends: ['app', 'desktop'], features: enabled ? ['feedback'] : [], packageManager: 'pnpm' }))
      for (const target of ['app', 'desktop']) {
        const root = path.join(directory, 'apps', `native-feedback-${target}`)
        const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
        const plugins = target === 'app' ? ['@capacitor/filesystem', '@capacitor/share'] : ['@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs']
        for (const name of ['@h-ai/feedback', ...plugins])
          expect(Boolean(manifest.dependencies[name])).toBe(enabled)
        expect((await readFile(path.join(root, 'src/main.ts'), 'utf8')).includes('configureFeedbackSaving')).toBe(enabled)
      }
      const native = path.join(directory, 'apps/native-feedback-desktop/src-tauri')
      const capabilities = JSON.parse(await readFile(path.join(native, 'capabilities/default.json'), 'utf8'))
      expect(capabilities.permissions.includes('dialog:allow-save')).toBe(enabled)
      expect(capabilities.permissions.includes('fs:allow-write-file')).toBe(enabled)
      expect((await readFile(path.join(native, 'Cargo.toml'), 'utf8')).includes('tauri-plugin-fs')).toBe(enabled)
      expect((await readFile(path.join(native, 'src/lib.rs'), 'utf8')).includes('tauri_plugin_fs::init')).toBe(enabled)
      const eslint = new ESLint({ cwd: directory, overrideConfigFile: path.join(directory, 'eslint.config.js') })
      const results = await eslint.lintFiles(['apps/native-feedback-app/package.json', 'apps/native-feedback-app/capacitor.config.ts', 'apps/native-feedback-app/src/main.ts', 'apps/native-feedback-desktop/package.json', 'apps/native-feedback-desktop/src/main.ts'])
      expect(results.flatMap(result => result.messages.filter(message => message.severity === 2).map(message => `${path.relative(directory, result.filePath)}:${message.line} ${message.ruleId} ${message.message}`))).toEqual([])
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it.each(['api', 'fullstack'] as const)('%s 的普通业务上下文从可信令牌取得用户并绑定应用 scope', async (appType) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-feedback-context-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({ name: 'feedback-sample', appType, frontends: ['web'], features: ['feedback'], packageManager: 'pnpm' }))
      const file = appType === 'api' ? 'apps/feedback-sample-service/src/app.ts' : 'packages/feedback-sample-serv/src/app-server.ts'
      const source = await readFile(path.join(directory, file), 'utf8')
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
      const declarations: string[] = []
      const visit = (node: ts.Node) => {
        if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ['authenticatedContext', 'createContext'].includes(item.name.getText(parsed))))
          declarations.push(node.getText(parsed))
        ts.forEachChild(node, visit)
      }
      visit(parsed)
      expect(declarations).toHaveLength(2)
      expect(source).toMatch(/\bcreateContext,/)
      const verifyToken = vi.fn(async (token: string) => token === 'trusted-token' ? ok({ userId: 'trusted-user', roles: ['user'], permissions: ['feedback:create'] }) : err(HaiCommonError.UNAUTHORIZED))
      const code = ts.transpileModule(`${declarations.join('\n')}\ncreateContext`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      const result: unknown = runInNewContext(code, { serv: { buildAuthContextFactory }, iam: { auth: { verifyToken } } })
      expect(typeof result).toBe('function')
      const createContext = result as CreateServContext
      const context = await createContext({ request: new Request('https://example.test/api', { headers: { 'authorization': 'Bearer trusted-token', 'x-scope-id': 'untrusted-scope', 'x-user-id': 'untrusted-user' } }) })
      expect(context.scopeId).toBe('feedback-sample')
      expect(context.session?.userId).toBe('trusted-user')
      expect(verifyToken).toHaveBeenCalledWith('trusted-token')
      const anonymous = await createContext({ request: new Request('https://example.test/api', { headers: { 'authorization': 'Bearer invalid', 'x-scope-id': 'untrusted-scope' } }) })
      expect(anonymous.scopeId).toBe('feedback-sample')
      expect(anonymous.session).toBeUndefined()
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('fullstack 实际生成相同采集组件的入口、列表、初始化和受保护接口', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-feedback-template-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({ name: 'feedback-sample', appType: 'fullstack', frontends: ['web'], features: ['feedback'], packageManager: 'pnpm' }))
      const shared = 'packages/feedback-sample-shared'
      const service = 'packages/feedback-sample-serv'
      const entry = await readFile(path.join(directory, shared, 'src/lib/components/FeedbackEntry.svelte'), 'utf8')
      const client = await readFile(path.join(directory, shared, 'src/lib/api/feedback-client.ts'), 'utf8')
      const list = await readFile(path.join(directory, shared, 'src/lib/pages/feedback.svelte'), 'utf8')
      expect(entry).toContain('browserFeedback.prepare()')
      expect(entry).toContain('<FeedbackModal')
      expect(entry).toContain('onfileschange={addFiles}')
      expect(entry).toContain('browserFeedback.addFiles(files, removedAttachmentIds)')
      expect(client).toContain('from \'@h-ai/feedback/client\'')
      expect(list).toContain('<FeedbackList')
      expect(list).toContain('<FeedbackDetail')
      expect(list).toContain('searchParams.get(\'feedback\')')
      const runtime = await readFile(path.join(directory, service, 'src/server/runtime.ts'), 'utf8')
      expect(runtime).toContain('core.module.createRuntime')
      expect(runtime).toContain('name: \'feedback\'')
      expect(runtime).toContain('close: () => feedback.close()')
      expect(await readFile(path.join(directory, service, 'config/_feedback.yml'), 'utf8')).toContain('HAI_FEEDBACK_APPID:feedback-sample')
      const procedures = await readFile(path.join(directory, service, 'src/server/procedures/index.ts'), 'utf8')
      expect(procedures).toContain('createFeedbackProcedures')
      expect(procedures).toContain('scopeId: \'feedback-sample\'')
      const manifest = JSON.parse(await readFile(path.join(directory, service, 'package.json'), 'utf8'))
      expect(manifest.dependencies['@h-ai/feedback']).toBe('catalog:')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['api', 'fullstack'] as const)('%s 的反馈入口通过生成工程的实际 lint 规则', async (appType) => {
    const directory = await mkdtemp(path.join(process.cwd(), '.tmp-feedback-quality-'))
    try {
      await generateFromTemplates(directory, buildTemplateContext({ name: 'feedback-sample', appType, frontends: ['web'], features: ['feedback'], packageManager: 'pnpm' }))
      const eslint = new ESLint({ cwd: directory, overrideConfigFile: path.join(directory, 'eslint.config.js') })
      const paths = appType === 'api'
        ? ['e2e', 'apps/feedback-sample-service/src/app.ts', 'apps/feedback-sample-service/src/lib/server/init.ts', 'apps/feedback-sample-service/src/server/procedures/index.ts', 'apps/feedback-sample-contract/src/feedback-sample-contract.ts']
        : ['e2e', 'packages/feedback-sample-serv/src/app-server.ts', 'packages/feedback-sample-serv/src/server/runtime.ts', 'packages/feedback-sample-serv/src/server/procedures/index.ts', 'packages/feedback-sample-contract/src/feedback-sample-contract.ts', 'packages/feedback-sample-shared/src/lib/api/feedback-client.ts', 'packages/feedback-sample-shared/src/lib/components/FeedbackEntry.svelte', 'packages/feedback-sample-shared/src/lib/components/AdminWorkspace.svelte', 'packages/feedback-sample-shared/src/lib/components/AppShell.svelte', 'packages/feedback-sample-shared/src/lib/pages/feedback.svelte']
      const results = await eslint.lintFiles(paths)
      expect(results.flatMap(result => result.messages.filter(message => message.severity === 2).map(message => `${path.relative(directory, result.filePath)}:${message.line} ${message.ruleId} ${message.message}`))).toEqual([])
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
