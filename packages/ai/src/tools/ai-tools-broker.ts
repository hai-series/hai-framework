import type { HaiResult } from '@h-ai/core'
import type { BuiltinToolBroker, BuiltinToolBrokerOptions } from './ai-tools-types.js'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createMCPServiceBroker } from '../mcp/ai-mcp-broker.js'

/**
 * 通过已有短期令牌、绑定撤销与 HTTP 传输桥接本地工具服务。
 * @example 模块内部上下文
 * ```ts
 * function mount(options: BuiltinToolBrokerOptions) { return createBuiltinToolBroker(options) }
 * ```
 */
export function createBuiltinToolBroker(options: BuiltinToolBrokerOptions): HaiResult<BuiltinToolBroker> {
  const lifecycle = new AbortController()
  const serviceId = 'hai-local-tools'
  const forbidden = () => core.err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
  const created = createMCPServiceBroker(async () => undefined, async () => forbidden(), {
    url: options.url,
    authorize: () => true,
  }, lifecycle.signal, {
    id: serviceId,
    async catalog(scope, sessionId, signal) {
      const result = await options.service.catalog({ scope, sessionId, signal })
      return result.success
        ? core.ok(result.data.tools)
        : result
    },
    async invoke(request, authorization, idempotencyKey) {
      if (!authorization.taskId)
        return forbidden()
      const result = await options.service.invoke({ name: request.tool, input: request.arguments ?? {}, idempotencyKey }, { scope: authorization.principal, sessionId: authorization.taskId, signal: authorization.signal })
      if (!result.success)
        return core.err(core.error.toPublic(result.error))
      return core.ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data),
          },
        ],
        structuredContent: { result: result.data },
      })
    },
  })
  if (!created.success)
    return created
  const broker = created.data
  return core.ok({
    async bind(input) {
      const catalog = await options.service.catalog({ scope: input.scope, sessionId: input.sessionId, signal: input.signal })
      if (!catalog.success)
        return catalog
      if (!input.tools.length || new Set(input.tools).size !== input.tools.length)
        return forbidden()
      const selected = catalog.data.tools.filter(tool => input.tools.includes(tool.name))
      if (selected.length !== input.tools.length)
        return forbidden()
      return broker.bind({
        principal: input.scope,
        taskId: input.sessionId,
        ttlMs: input.ttlMs,
        signal: input.signal,
        tools: selected.map(tool => ({
          id: tool.name,
          serviceId,
          tool: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      })
    },
    handleRequest: (request, response) => broker.handleRequest(request, response),
    close() {
      lifecycle.abort()
      broker.close()
    },
  })
}
