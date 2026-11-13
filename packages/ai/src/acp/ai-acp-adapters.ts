import type { z } from 'zod'
import type { AIConfig, ApiType } from '../ai-config.js'
import type { ACPAgentSchema } from './ai-acp-config.js'
import type { ACPAgentAdapter } from './ai-acp-types.js'
import process from 'node:process'
import { resolveModelEntry } from '../ai-config.js'
import { ACPFailure } from './ai-acp-errors.js'

/**
 * 从已有 Hai 模型条目解析，禁止把不存在的 ID 当成模型名。
 * @param agent - 智能体定义及允许使用的模型 ID 列表。
 * @param config - 合并数据库清单后的当前 AI 配置。
 * @returns 包含协议、能力和凭据的模型列表；仅供可信服务端使用。
 * @example
 * ```ts
 * // 模块内部上下文：复用当前模块类型。
 * function inspectModels(agent: z.infer<typeof ACPAgentSchema>, config: AIConfig) { return resolveAgentModels(agent, config).map(model => model.id) }
 * ```
 */
export function resolveAgentModels(
  agent: z.infer<typeof ACPAgentSchema>,
  config: AIConfig,
) {
  return agent.modelIds.map((id) => {
    const entry = config.llm?.models?.find(model => model.id === id)
    if (!config.llm || !entry)
      throw new ACPFailure('model', { modelId: id })
    const protocol = entry.protocol ?? config.llm.protocol
    // 与现有 Anthropic Provider 一致：不能继承 OpenAI 专属地址/环境变量。
    const llm
      = protocol === 'anthropic'
        ? {
            ...config.llm,
            apiKey:
              entry.apiKey
              ?? config.llm.apiKey
              ?? (process.env.HAI_AI_LLM_APIKEY?.trim()
                || process.env.ANTHROPIC_API_KEY),
            baseUrl:
              entry.baseUrl
              ?? (config.llm.protocol === 'anthropic'
                ? (config.llm.baseUrl ?? process.env.HAI_AI_LLM_BASEURL)
                : undefined)
              ?? process.env.ANTHROPIC_BASE_URL
              ?? 'https://api.anthropic.com',
          }
        : config.llm
    if (protocol === 'anthropic' && !llm.apiKey)
      throw new ACPFailure('model', { modelId: id })
    // ACP 的 modelIds 是目录 ID。不能匹配到另一个条目的同名原生模型。
    const result = resolveModelEntry({
      ...llm,
      models: [entry],
    }, 'default', id)
    if (!result.success)
      throw new ACPFailure('model', { modelId: id })
    if (result.data.capabilities?.toolCalling === false)
      throw new ACPFailure('model', { modelId: id })
    return { id, config: result.data }
  })
}
/**
 * 解析服务端环境变量引用。
 * @param references - 目标变量名到宿主环境变量名的映射。
 * @returns 当前已解析值；缺失引用抛出 ACPFailure，不写入持久资源定义。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function credentialNames(refs: Record<string, string>) { return Object.keys(resolveEnvironment(refs)) }
 * ```
 */
export function resolveEnvironment(references: Record<string, string>) {
  const env: Record<string, string> = {}
  for (const [key, source] of Object.entries(references)) {
    const value = process.env[source]
    if (!value)
      throw new ACPFailure('invalid', { environment: source })
    env[key] = value
  }
  return env
}

/**
 * 已核对固定版本的原生接入能力；允许共享前需要通过平台隔离验收。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const transports = Object.values(nativeAdapterCapabilities).map(adapter => adapter.managedTransport)
 * ```
 */
export const nativeAdapterCapabilities: Readonly<Record<string, {
  managedTransport: 'stdio'
  protocols: readonly ApiType[]
  workerModes: readonly ('shared' | 'user' | 'task')[]
  nativeResume: 'load' | 'resume' | 'none'
}>> = Object.freeze({
  'codex': {
    managedTransport: 'stdio',
    protocols: ['responses'],
    workerModes: ['user', 'task'],
    nativeResume: 'load',
  },
  'deepseek-harness': {
    managedTransport: 'stdio',
    protocols: ['chat', 'responses', 'anthropic'],
    workerModes: ['user', 'task'],
    nativeResume: 'resume',
  },
  'goose': {
    managedTransport: 'stdio',
    protocols: ['chat', 'responses', 'anthropic'],
    workerModes: ['user', 'task'],
    nativeResume: 'load',
  },
})

/**
 * 内置原生配置适配器。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const supportedAdapters = Object.keys(nativeAdapters)
 * ```
 */
export const nativeAdapters: Record<string, ACPAgentAdapter> = {
  'deepseek-harness': {
    configure({ agent, models, modelId, statePath, permissionProfile = 'workspace' }) {
      const selected = models.find(item => item.id === modelId)
      const apiKey = selected?.config.apiKey
      if (!selected || !apiKey)
        throw new ACPFailure('model', { modelId })
      const model = selected.config
      const caps = model.capabilities
      if (
        !caps?.contextWindow
        || !caps.maxOutputTokens
        || !caps.inputModalities
        || caps.toolCalling !== true
        || !caps.reasoning
        || (caps.reasoning.supported && !caps.reasoning.efforts?.length)
        || caps.inputModalities.some(item => !['text', 'image'].includes(item))
      ) {
        throw new ACPFailure('model', { modelId })
      }
      const key = 'HAI_ACP_MODEL_0'
      const providers = {
        'hai-0': {
          apiKeyEnv: key,
          baseURL: model.baseUrl,
          api: {
            chat: 'openai-completions',
            responses: 'openai-responses',
            anthropic: 'anthropic-messages',
          }[model.protocol],
          // 输出容量是能力声明；单轮预算沿用 Hai 模型的 maxTokens。
          defaultMaxTokens: Math.min(model.maxTokens, caps.maxOutputTokens),
          defaultContextWindow: caps.contextWindow,
          timeoutMs: model.timeout,
          retryPolicy: { mode: 'normal', maxRetries: 0 },
          models: [
            {
              id: model.model,
              contextWindow: caps.contextWindow,
              input: caps.inputModalities,
              reasoningEfforts: caps.reasoning.supported
                ? Object.fromEntries(caps.reasoning.efforts!.map(effort => [effort, effort]))
                : false,
            },
          ],
        },
      }
      const patch = [
        {
          id: 'llm-pi-ai',
          config: { providers },
        },
        {
          id: 'acp',
          config: {
            provider: 'hai-0',
            model: model.model,
          },
        },
      ]
      return {
        command:
          agent.mode === 'custom-service'
            ? 'dsh'
            : (agent.command ?? 'dsh'),
        args: [
          // 自定义命令可能是 node + JS 入口，入口参数必须先于 dsh 的原生选项。
          ...(agent.mode === 'custom-service'
            ? []
            : (agent.args ?? [])),
          '--profile',
          'acp',
          '--patch',
          `${statePath}/hai-config.json`,
        ],
        env: {
          DSH_HOME: statePath,
          DSH_PERMISSION_MODE: {
            'read-only': 'read-only',
            'workspace': 'workspace-write',
            'full-access': 'danger-full-access',
          }[permissionProfile],
          [key]: apiKey,
        },
        files: {
          'hai-config.json': JSON.stringify(patch),
        },
      }
    },
  },
  'goose': {
    configure({ agent, models, modelId, statePath, permissionProfile = 'workspace' }) {
      if (agent.mode === 'custom-service')
        throw new ACPFailure('unsupported', { adapter: agent.adapter })
      const model = models.find(entry => entry.id === modelId)?.config
      if (!model?.apiKey)
        throw new ACPFailure('model', { modelId })

      const base = URL.parse(model.baseUrl)
      if (!base || !['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.hash || base.search)
        throw new ACPFailure('model', { modelId })
      const timeout = String(Math.ceil(model.timeout / 1000))
      const env: Record<string, string> = {
        GOOSE_PATH_ROOT: statePath,
        GOOSE_PROVIDER: model.protocol === 'anthropic'
          ? 'anthropic'
          : 'openai',
        GOOSE_MODEL: model.model,
        GOOSE_MODE: {
          'read-only': 'chat',
          'workspace': 'approve',
          'full-access': 'auto',
        }[permissionProfile],
        GOOSE_DISABLE_KEYRING: '1',
        GOOSE_DISABLE_SESSION_NAMING: 'true',
        GOOSE_MAX_TOKENS: String(Math.min(model.maxTokens, model.capabilities?.maxOutputTokens ?? model.maxTokens)),
        GOOSE_TEMPERATURE: String(model.temperature),
      }
      if (model.capabilities?.contextWindow)
        env.GOOSE_CONTEXT_LIMIT = String(model.capabilities.contextWindow)

      const prefix = base.pathname.replace(/\/+$/, '')
      if (model.protocol === 'anthropic') {
        // 原生 Anthropic 提供方自己附加 v1/messages。
        env.ANTHROPIC_HOST = `${base.origin}${prefix.replace(/\/v1$/, '')}`
        env.ANTHROPIC_API_KEY = model.apiKey
        env.ANTHROPIC_TIMEOUT = timeout
      }
      else {
        // 用以斜杠开头的路径固定协议并保留网关前缀；默认路径可能按模型名称切换协议。
        const endpoint = model.protocol === 'responses'
          ? 'responses'
          : 'chat/completions'
        env.OPENAI_BASE_URL = `${base.origin}${prefix}`
        env.OPENAI_BASE_PATH = `${prefix}/${endpoint}`
        env.OPENAI_API_KEY = model.apiKey
        env.OPENAI_TIMEOUT = timeout
      }
      return { command: agent.command ?? 'goose', args: agent.args ?? ['acp'], env }
    },
  },
  'generic': {
    configure({ agent, models }) {
      if (agent.mode === 'custom-service' || !agent.command || models.length)
        throw new ACPFailure('model')
      return { command: agent.command, args: agent.args ?? [], env: {} }
    },
  },
  'codex': {
    configure({ agent, models, modelId, statePath, permissionProfile, reasoningEffort }) {
      const selected = models.find(item => item.id === modelId)
      if (!selected || selected.config.protocol !== 'responses')
        throw new ACPFailure('model', { modelId })
      const model = selected.config
      const sandbox = permissionProfile === undefined
        ? undefined
        : {
            'read-only': 'read-only',
            'workspace': 'workspace-write',
            'full-access': 'danger-full-access',
          }[permissionProfile]
      const provider = {
        name: 'Hai',
        base_url: model.baseUrl,
        wire_api: 'responses',
        env_key: 'HAI_ACP_CODEX_MODEL_KEY',
      }
      const config = {
        model: model.model,
        model_provider: 'hai',
        model_context_window: model.capabilities?.contextWindow,
        model_reasoning_effort: reasoningEffort,
        sandbox_mode: sandbox,
        approval_policy: sandbox ? 'on-request' : undefined,
        model_providers: { hai: provider },
      }
      // TOML 基本字符串禁止未转义的 DEL，JSON.stringify 会保留该字符。
      const tomlString = (value: string) => JSON.stringify(value).replaceAll(String.fromCharCode(127), '\\u007f')
      const startup = [
        `model_provider = ${tomlString(config.model_provider)}`,
        `model = ${tomlString(config.model)}`,
        ...(config.model_context_window === undefined
          ? []
          : [`model_context_window = ${config.model_context_window}`]),
        ...(reasoningEffort
          ? [`model_reasoning_effort = ${tomlString(reasoningEffort)}`]
          : []),
        ...(sandbox
          ? [
              `sandbox_mode = ${tomlString(sandbox)}`,
              'approval_policy = "on-request"',
              'shell_environment_policy.exclude = ["HAI_ACP_CODEX_MODEL_KEY"]',
            ]
          : []),
        '',
        '[model_providers.hai]',
        ...Object.entries(provider).map(([key, value]) => `${key} = ${tomlString(value)}`),
        '',
      ].join('\n')
      return {
        command:
          agent.mode === 'custom-service'
            ? 'codex-acp'
            : (agent.command ?? 'codex-acp'),
        args: agent.mode === 'custom-service'
          ? []
          : (agent.args ?? []),
        env: {
          CODEX_HOME: statePath,
          [provider.env_key]: model.apiKey!,
          NO_BROWSER: '1',
          MODEL_PROVIDER: config.model_provider,
          CODEX_CONFIG: JSON.stringify(config),
        },
        // CODEX_CONFIG 在创建 thread 时才完整生效。目录请求需要在 App Server 启动前选定同一提供方。
        files: {
          'config.toml': startup,
          ...(sandbox
            ? {
                // 使用原生强制要求，阻止项目配置和会话设置扩大权限。
                'requirements.toml': `allowed_sandbox_modes = [${tomlString(sandbox)}]\nallowed_approval_policies = ["on-request"]\n`,
              }
            : {}),
        },
      }
    },
  },
}
