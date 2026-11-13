import { afterEach, describe, expect, it } from 'vitest'
import { nativeAdapterCapabilities, nativeAdapters, resolveAgentModels } from '../src/acp/ai-acp-adapters.js'
import { ACPAgentSchema, ai, AIConfigSchema } from '../src/index.js'

const capabilities = {
  contextWindow: 65536,
  maxOutputTokens: 2048,
  inputModalities: ['text'],
  outputModalities: ['text'],
  toolCalling: true,
  reasoning: { supported: false },
} as const

const config = AIConfigSchema.parse({
  llm: {
    models: [
      {
        id: 'chat-model',
        model: 'gpt-5-fixture',
        protocol: 'chat',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'chat-fixture',
        maxTokens: 5000,
        capabilities,
      },
      {
        id: 'responses-model',
        model: 'response-fixture',
        protocol: 'responses',
        baseUrl: 'https://gateway.example/proxy/v1/',
        apiKey: 'responses-fixture',
        capabilities,
      },
      {
        id: 'anthropic-model',
        model: 'claude-fixture',
        protocol: 'anthropic',
        baseUrl: 'https://anthropic.example/gateway',
        apiKey: 'anthropic-fixture',
        capabilities,
      },
    ],
  },
})

function registeredAgent(adapter: string) {
  return ACPAgentSchema.parse({
    id: adapter,
    name: adapter,
    mode: 'embedded',
    adapter,
    modelIds: ['chat-model', 'responses-model', 'anthropic-model'],
  })
}

describe('原生智能体适配器', () => {
  afterEach(async () => ai.close())

  it('goose 使用受管 stdio 和选定模型的隔离配置', async () => {
    const agent = registeredAgent('goose')
    const launch = await nativeAdapters.goose!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'chat-model',
      statePath: '/state/task',
    })
    expect(launch.command).toBe('goose')
    expect(launch.args).toEqual(['acp'])
    expect(launch.env).toMatchObject({
      GOOSE_PATH_ROOT: '/state/task',
      GOOSE_PROVIDER: 'openai',
      GOOSE_MODEL: 'gpt-5-fixture',
      GOOSE_MODE: 'approve',
      GOOSE_DISABLE_KEYRING: '1',
      GOOSE_MAX_TOKENS: '2048',
      OPENAI_API_KEY: 'chat-fixture',
      OPENAI_BASE_URL: 'https://gateway.example/v1',
      OPENAI_BASE_PATH: '/v1/chat/completions',
    })
    expect(JSON.stringify(launch)).not.toContain('responses-fixture')
    expect(JSON.stringify(launch)).not.toContain('anthropic-fixture')
    expect(JSON.stringify(launch.files ?? {})).not.toContain('chat-fixture')
  })

  it.each([
    [
      'responses-model',
      { GOOSE_PROVIDER: 'openai', OPENAI_BASE_PATH: '/proxy/v1/responses' },
    ],
    [
      'anthropic-model',
      { GOOSE_PROVIDER: 'anthropic', ANTHROPIC_HOST: 'https://anthropic.example/gateway' },
    ],
  ])('goose 原生协议映射 %s', async (modelId, env) => {
    const agent = registeredAgent('goose')
    const launch = await nativeAdapters.goose!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId,
      statePath: '/state/task',
    })
    expect(launch.env).toMatchObject(env)
  })

  it('goose 通过 AI 清单初始化，拒绝未登记模型', async () => {
    const agent = registeredAgent('goose')
    expect((await ai.init({
      ...config,
      acp: {
        agents: [agent],
      },
    })).success).toBe(true)
    const accepted = await ai.acp.agents.initialize(agent.id, 'chat-model')
    expect(accepted.success).toBe(true)
    const denied = await ai.acp.agents.initialize(agent.id, 'not-registered')
    expect(denied.success).toBe(false)
    if (!denied.success)
      expect(denied.error.code).toBe('hai:ai:083')
  })

  it('dSH 只暴露本次启动的模型密钥和原生模型目录', async () => {
    const agent = registeredAgent('deepseek-harness')
    const launch = await nativeAdapters['deepseek-harness']!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'responses-model',
      statePath: '/state/task',
    })
    expect(launch.env).toEqual({ DSH_HOME: '/state/task', HAI_ACP_MODEL_0: 'responses-fixture', DSH_PERMISSION_MODE: 'workspace-write' })
    expect(JSON.parse(launch.files!['hai-config.json']!)).toMatchObject([
      {
        id: 'llm-pi-ai',
        config: {
          providers: {
            'hai-0': { api: 'openai-responses' },
          },
        },
      },
      {
        id: 'acp',
        config: { provider: 'hai-0', model: 'response-fixture' },
      },
    ])
    expect(Object.keys(JSON.parse(launch.files!['hai-config.json']!)[0].config.providers)).toEqual(['hai-0'])
  })

  it.each([
    { adapter: 'goose', field: 'GOOSE_MODE', expected: 'chat' },
    { adapter: 'deepseek-harness', field: 'DSH_PERMISSION_MODE', expected: 'read-only' },
  ])('maps the read-only profile in $adapter', async ({ adapter, field, expected }) => {
    const agent = registeredAgent(adapter)
    const launch = await nativeAdapters[adapter]!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'chat-model',
      statePath: '/state/task',
      permissionProfile: 'read-only',
    })
    expect(launch.env[field]).toBe(expected)
  })

  it('原生 resume/load 能力独立声明，未验证隔离的适配器不允许 shared', () => {
    expect(nativeAdapterCapabilities.codex).toMatchObject({
      managedTransport: 'stdio',
      workerModes: ['user', 'task'],
    })
    expect(nativeAdapterCapabilities['deepseek-harness']).toMatchObject({
      nativeResume: 'resume',
      workerModes: ['user', 'task'],
    })
    expect(nativeAdapterCapabilities.goose).toMatchObject({
      nativeResume: 'load',
      workerModes: ['user', 'task'],
    })
  })
})
