import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { afterEach, describe, expect, it } from 'vitest'
import { nativeAdapters, resolveAgentModels } from '../src/acp/ai-acp-adapters.js'
import {
  ACPAgentSchema,
  ACPWorkspaceSchema,
  ai,
  AIConfigSchema,
  ModelCapabilitiesSchema,
} from '../src/index.js'

afterEach(async () => {
  await ai.close()
})
describe('aCP contracts', () => {
  it.each([
    { budget: 1024, expected: 1024 },
    { budget: 100000, expected: 65535 },
  ])('dsh 原生输出预算为 min($budget, capacity)，上下文容量保持独立', async ({ budget, expected }) => {
    const config = AIConfigSchema.parse({
      llm: {
        models: [
          {
            id: 'coding',
            model: 'fixture-model',
            protocol: 'chat',
            apiKey: 'fixture-key',
            maxTokens: budget,
            capabilities: {
              contextWindow: 1048576,
              maxOutputTokens: 65535,
              inputModalities: ['text', 'image'],
              outputModalities: ['text'],
              toolCalling: true,
              reasoning: { supported: false },
            },
          },
        ],
      },
    })
    const entry = '/native/dsh/lib/bin.js'
    const agent = ACPAgentSchema.parse({
      id: 'dsh',
      name: 'DSH',
      mode: 'embedded',
      adapter: 'deepseek-harness',
      modelIds: ['coding'],
      command: process.execPath,
      args: [entry],
    })
    // 直接验证原生配置边界，不启动程序或模型请求。
    const launch = await nativeAdapters['deepseek-harness']!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'coding',
      statePath: '/state/test',
    })
    expect(launch.command).toBe(process.execPath)
    expect(launch.args).toEqual([
      entry,
      '--profile',
      'acp',
      '--patch',
      '/state/test/hai-config.json',
    ])
    const patch: unknown = JSON.parse(launch.files!['hai-config.json']!)
    expect(patch).toMatchObject([
      {
        id: 'llm-pi-ai',
        config: {
          providers: {
            'hai-0': {
              defaultMaxTokens: expected,
              defaultContextWindow: 1048576,
              models: [
                { id: 'fixture-model', contextWindow: 1048576 },
              ],
            },
          },
        },
      },
      {
        id: 'acp',
        config: { provider: 'hai-0', model: 'fixture-model' },
      },
    ])
  })

  it.each([
    'ai-playground',
    'api-service',
    'corporate-website',
    'h5-app',
  ])('%s 原配置和启用后的 ACP 示例均符合实际 Schema', async (app) => {
    const text = await readFile(path.resolve('../../apps', app, 'config/_ai.yml'), 'utf8')
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-acp-config-'))
    if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('hai-acp-config-'))
      throw new Error('Unexpected ACP config fixture path')
    try {
      const file = path.join(directory, '_ai.yml')
      await writeFile(file, text)
      const original = core.config.load('ai', file)
      expect(original.success).toBe(true)
      if (!original.success)
        return
      expect(AIConfigSchema.safeParse(original.data).success).toBe(true)
      core.config.clear('ai')
      // 提取可取消注释的实际示例，验证字段归属及模型引用，避免只检查注释关键词。
      const model = text.slice(text.indexOf('  # models:'), text.indexOf('  # 能力元数据')).replace(/^ {2}# ?/gm, '  ')
      const acp = text.slice(text.indexOf('# acp:')).replace(/^# ?/gm, '')
      await writeFile(file, `llm:\n${model}\n${acp}`)
      const enabled = core.config.load('ai', file)
      expect(enabled.success).toBe(true)
      if (!enabled.success)
        return
      const config = AIConfigSchema.parse(enabled.data)
      expect(config.acp?.agents[0]?.modelIds).toEqual([config.llm?.models?.[0]?.id])
      expect(config.llm?.models?.[0]?.protocol).toBe('responses')
      expect(config.acp?.workspaces[0]?.repositories[0]?.mainBranch).toBe('trunk')
      expect(config.mcp?.servers[0]?.environmentRefs).toEqual({ API_TOKEN: 'DOCS_API_TOKEN' })
    }
    finally {
      core.config.clear('ai')
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('要求主分支和兼容的模型能力', () => {
    expect(
      ACPWorkspaceSchema.safeParse({
        id: 'test',
        storage: { type: 'directory', path: '/tmp/test' },
        repositories: [
          { id: 'code', url: 'local' },
        ],
      }).success,
    ).toBe(false)
    expect(
      ModelCapabilitiesSchema.safeParse({
        contextWindow: 10,
        maxOutputTokens: 11,
      }).success,
    ).toBe(false)
    expect(
      ModelCapabilitiesSchema.safeParse({
        reasoning: {
          supported: false,
          efforts: ['high'],
        },
      }).success,
    ).toBe(false)
    expect(
      ACPAgentSchema.safeParse({
        id: 'test',
        name: 'test',
        mode: 'custom-service',
        transport: 'http',
        url: 'ws://localhost',
        supportedTransports: ['http'],
      }).success,
    ).toBe(false)
  })
  it('未初始化入口返回结果，关闭后旧入口失效', async () => {
    expect(ai.acp).toBe(ai.acp)
    expect((await ai.acp.agents.list()).success).toBe(false)
    expect((await ai.init()).success).toBe(true)
    const acp = ai.acp
    expect(
      (
        await acp.agents.register({
          id: 'generic',
          name: 'Generic',
          mode: 'embedded',
          command: process.execPath,
        })
      ).success,
    ).toBe(true)
    await ai.close()
    expect((await acp.agents.list()).success).toBe(false)
  })
  it('dsh 缺少推理档位时在初始化阶段返回模型不兼容', async () => {
    expect((await ai.init({
      llm: {
        models: [
          {
            id: 'reasoning',
            model: 'fixture',
            apiKey: 'fixture',
            capabilities: {
              contextWindow: 32768,
              maxOutputTokens: 1024,
              inputModalities: ['text'],
              toolCalling: true,
              reasoning: { supported: true },
            },
          },
        ],
      },
    })).success).toBe(true)
    expect((await ai.acp.agents.register({
      id: 'dsh',
      name: 'DSH',
      mode: 'embedded',
      adapter: 'deepseek-harness',
      modelIds: ['reasoning'],
    })).success).toBe(true)
    const result = await ai.acp.agents.initialize('dsh')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:ai:083')
  })
  it('不重复维护模型，未绑定和不兼容模型明确失败', async () => {
    expect(
      (
        await ai.init({
          llm: {
            apiKey: 'fixture-key',
            models: [
              { id: 'chat-only', model: 'fixture', protocol: 'chat' },
            ],
          },
        })
      ).success,
    ).toBe(true)
    expect(
      (
        await ai.acp.agents.register({
          id: 'codex',
          name: 'Codex',
          mode: 'embedded',
          adapter: 'codex',
          modelIds: ['chat-only'],
        })
      ).success,
    ).toBe(true)
    const result = await ai.acp.agents.initialize('codex')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:ai:083')
    expect(
      (
        await ai.acp.agents.register({
          id: 'missing',
          name: 'Missing',
          mode: 'embedded',
          adapter: 'codex',
          modelIds: ['unknown'],
        })
      ).success,
    ).toBe(false)
  })
})
