import { describe, expect, it } from 'vitest'
import { nativeAdapters, resolveAgentModels } from '../src/acp/ai-acp-adapters.js'
import { ACPAgentSchema } from '../src/acp/ai-acp-config.js'
import { AIConfigSchema } from '../src/ai-config.js'

describe('codex native startup configuration', () => {
  it('为启动阶段和会话选择同一个已登记的 Responses 提供方，并隔离凭据', async () => {
    const agent = ACPAgentSchema.parse({
      id: 'codex',
      name: 'Codex',
      mode: 'embedded',
      adapter: 'codex',
      modelIds: ['primary', 'secondary'],
    })
    const config = AIConfigSchema.parse({
      llm: {
        models: [
          {
            id: 'primary',
            // 原生名称与另一个目录 ID 相同，启动仍应按精确 ID 选条目。
            model: 'secondary',
            apiKey: 'primary-test-key',
            protocol: 'responses',
            baseUrl: 'https://primary.example.test/v1',
          },
          {
            id: 'secondary',
            model: 'secondary-native-model',
            apiKey: 'secondary-test-key',
            protocol: 'responses',
            baseUrl: 'https://secondary.example.test/v1',
            capabilities: { contextWindow: 65536 },
          },
        ],
      },
    })
    const launch = await nativeAdapters.codex!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'secondary',
      statePath: '/state/secondary',
    })
    expect(launch.env.CODEX_HOME).toBe('/state/secondary')
    expect(launch.files?.['config.toml']).toContain('model_provider = "hai"\n')
    expect(launch.files?.['config.toml']).toContain('model = "secondary-native-model"\n')
    expect(launch.files?.['config.toml']).toContain('model_context_window = 65536\n')
    expect(launch.files?.['config.toml']).toContain('[model_providers.hai]\n')
    expect(launch.files?.['config.toml']).toContain('base_url = "https://secondary.example.test/v1"\n')
    expect(launch.files?.['config.toml']).toContain('wire_api = "responses"\n')
    expect(launch.files?.['config.toml']).toContain('env_key = "HAI_ACP_CODEX_MODEL_KEY"\n')
    expect(JSON.parse(launch.env.CODEX_CONFIG!)).toMatchObject({
      model: 'secondary-native-model',
      model_provider: 'hai',
      model_context_window: 65536,
      model_providers: {
        hai: {
          base_url: 'https://secondary.example.test/v1',
          wire_api: 'responses',
          env_key: 'HAI_ACP_CODEX_MODEL_KEY',
        },
      },
    })
    expect(launch.env.HAI_ACP_CODEX_MODEL_KEY).toBe('secondary-test-key')
    expect(launch.env.CODEX_API_KEY).toBeUndefined()
    expect(launch.env.OPENAI_API_KEY).toBeUndefined()
    expect(JSON.stringify(launch.files)).not.toContain('secondary-test-key')
    expect(launch.env.CODEX_CONFIG).not.toContain('secondary-test-key')
    expect(JSON.stringify(launch)).not.toContain('primary-test-key')
  })

  it('按 TOML 字符串编码模型名中的换行、引号、反斜线和控制字符', async () => {
    const model = 'fixture\n[features]\t"model"\\\x7F'
    const agent = ACPAgentSchema.parse({
      id: 'codex',
      name: 'Codex',
      mode: 'embedded',
      adapter: 'codex',
      modelIds: ['escaping'],
    })
    const config = AIConfigSchema.parse({
      llm: {
        models: [
          {
            id: 'escaping',
            model,
            apiKey: 'fixture-key',
            protocol: 'responses',
          },
        ],
      },
    })
    const launch = await nativeAdapters.codex!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'escaping',
      statePath: '/state/escaping',
    })
    expect(launch.files?.['config.toml']?.split('\n')).toContain(String.raw`model = "fixture\n[features]\t\"model\"\\\u007f"`)
    expect(launch.files?.['config.toml']).not.toContain('model_context_window')
    expect(JSON.parse(launch.env.CODEX_CONFIG!).model).toBe(model)
  })

  it.each([
    { permissionProfile: 'read-only', sandbox: 'read-only' },
    { permissionProfile: 'workspace', sandbox: 'workspace-write' },
    { permissionProfile: 'full-access', sandbox: 'danger-full-access' },
  ] as const)('在原生启动、会话与强制要求中应用 $permissionProfile', async ({ permissionProfile, sandbox }) => {
    const agent = ACPAgentSchema.parse({
      id: 'codex',
      name: 'Codex',
      mode: 'builtin-service',
      image: 'hai-ai/codex-acp:test',
      adapter: 'codex',
      modelIds: ['fixture'],
    })
    const config = AIConfigSchema.parse({
      llm: {
        models: [
          {
            id: 'fixture',
            model: 'fixture-model',
            apiKey: 'fixture-key',
            protocol: 'responses',
          },
        ],
      },
    })
    const launch = await nativeAdapters.codex!.configure({
      agent,
      models: resolveAgentModels(agent, config),
      modelId: 'fixture',
      statePath: '/state',
      permissionProfile,
    })
    expect(launch.files?.['config.toml']).toContain(`sandbox_mode = "${sandbox}"\n`)
    expect(launch.files?.['config.toml']).toContain('approval_policy = "on-request"\n')
    expect(launch.files?.['requirements.toml']).toContain(`allowed_sandbox_modes = ["${sandbox}"]\n`)
    expect(launch.files?.['requirements.toml']).toContain('allowed_approval_policies = ["on-request"]\n')
    expect(JSON.parse(launch.env.CODEX_CONFIG!)).toMatchObject({ sandbox_mode: sandbox, approval_policy: 'on-request' })
  })
})
