import type { z } from 'zod'
import type { AIConfig } from '../ai-config.js'
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
    if (!config.llm?.models?.some(entry => entry.id === id))
      throw new ACPFailure('model', { modelId: id })
    const entry = config.llm.models.find(model => model.id === id)!
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
    const result = resolveModelEntry(llm, 'default', id)
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
 * 内置原生配置适配器。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const supportedAdapters = Object.keys(nativeAdapters)
 * ```
 */
export const nativeAdapters: Record<string, ACPAgentAdapter> = {
  'deepseek-harness': {
    configure({ agent, models, modelId, statePath }) {
      const selected = models.findIndex(item => item.id === modelId)
      if (selected < 0)
        throw new ACPFailure('model', { modelId })
      const env: Record<string, string> = { DSH_HOME: statePath }
      const providers: Record<string, unknown> = {}
      for (const [index, entry] of models.entries()) {
        const model = entry.config
        const caps = model.capabilities
        if (
          !caps?.contextWindow
          || !caps.maxOutputTokens
          || !caps.inputModalities
          || caps.toolCalling !== true
          || !caps.reasoning
          || (caps.reasoning.supported && !caps.reasoning.efforts?.length)
        ) {
          throw new ACPFailure('model', { modelId: entry.id })
        }
        if (
          caps.inputModalities.some(item => !['text', 'image'].includes(item))
        )
          throw new ACPFailure('model', { modelId: entry.id })
        const key = `HAI_ACP_MODEL_${index}`
        env[key] = model.apiKey!
        providers[`hai-${index}`] = {
          apiKeyEnv: key,
          baseURL: model.baseUrl,
          api:
            model.protocol === 'chat'
              ? 'openai-completions'
              : model.protocol === 'responses'
                ? 'openai-responses'
                : 'anthropic-messages',
          defaultMaxTokens: caps.maxOutputTokens,
          defaultContextWindow: caps.contextWindow,
          timeoutMs: model.timeout,
          retryPolicy: { mode: 'normal', maxRetries: 0 },
          models: [
            {
              id: model.model,
              contextWindow: caps.contextWindow,
              input: caps.inputModalities,
              reasoningEfforts: caps.reasoning.supported
                ? Object.fromEntries(
                    (caps.reasoning.efforts ?? []).map(effort => [
                      effort,
                      effort,
                    ]),
                  )
                : false,
            },
          ],
        }
      }
      const patch = [
        { id: 'llm-pi-ai', config: { providers } },
        {
          id: 'acp',
          config: {
            provider: `hai-${selected}`,
            model: models[selected]!.config.model,
          },
        },
      ]
      return {
        command:
          agent.mode === 'custom-service' ? 'dsh' : (agent.command ?? 'dsh'),
        args: [
          '--profile',
          'acp',
          '--patch',
          `${statePath}/hai-config.json`,
          ...(agent.mode === 'custom-service' ? [] : (agent.args ?? [])),
        ],
        env,
        files: { 'hai-config.json': JSON.stringify(patch) },
      }
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
    configure({ agent, models, modelId, statePath }) {
      const selected = models.find(item => item.id === modelId)
      if (!selected || selected.config.protocol !== 'responses')
        throw new ACPFailure('model', { modelId })
      const model = selected.config
      return {
        command:
          agent.mode === 'custom-service'
            ? 'codex-acp'
            : (agent.command ?? 'codex-acp'),
        args: agent.mode === 'custom-service' ? [] : (agent.args ?? []),
        env: {
          CODEX_HOME: statePath,
          CODEX_API_KEY: model.apiKey!,
          OPENAI_API_KEY: model.apiKey!,
          NO_BROWSER: '1',
          DEFAULT_AUTH_REQUEST: JSON.stringify({ methodId: 'api-key' }),
          MODEL_PROVIDER: 'hai',
          CODEX_CONFIG: JSON.stringify({
            model: model.model,
            model_provider: 'hai',
            model_context_window: model.capabilities?.contextWindow,
            model_providers: {
              hai: {
                name: 'Hai',
                base_url: model.baseUrl,
                wire_api: 'responses',
                env_key: 'CODEX_API_KEY',
              },
            },
          }),
        },
      }
    },
  },
}
