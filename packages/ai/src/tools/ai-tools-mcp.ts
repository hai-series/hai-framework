import type { HaiResult } from '@h-ai/core'
import type { ToolDefinition } from '@h-ai/tools'
import type { ToolServiceContext, ToolSet } from '@h-ai/tools/server'
import type { MCPServiceAuthorization, MCPServiceOperations } from '../mcp/ai-mcp-types.js'
import { core } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { z } from 'zod'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

/**
 * 将可信管理员登记的 MCP 输入契约连接到中立工具目录。
 * @example
 * ```ts
 * import type { McpToolOptions } from '@h-ai/ai'
 * function count(options: McpToolOptions) { return options.definitions.length }
 * ```
 */
export interface McpToolOptions {
  context: ToolServiceContext
  definitions: (ToolDefinition & { serviceId: string, tool: string })[]
  authorize: MCPServiceAuthorization['authorize']
}

/**
 * MCP 连接、凭据和调用限额继续由已有服务管理。
 * @example 模块内部上下文
 * ```ts
 * function build(options: McpToolOptions, services: () => MCPServiceOperations) { return createMcpTools(options, services) }
 * ```
 */
export function createMcpTools(options: McpToolOptions, services: () => MCPServiceOperations): HaiResult<ToolSet> {
  try {
    const definitions = options.definitions.map((definition) => {
      const parameters = z.fromJSONSchema(definition.inputSchema)
      return tools.define({
        name: definition.name,
        title: definition.title,
        description: definition.description,
        examples: definition.examples,
        parameters,
        timeoutMs: 300_000,
        resultHandler: async (input, { signal }) => {
          const args = z.record(z.string(), z.unknown()).safeParse(input)
          if (!args.success)
            return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
          const result = await services().invoke({ serviceId: definition.serviceId, tool: definition.tool, arguments: args.data }, {
            principal: options.context.scope,
            taskId: options.context.sessionId,
            signal,
            authorize: options.authorize,
          })
          if (!result.success)
            return result
          if (result.data.isError)
            return core.err(HaiAIError.MCP_TOOL_ERROR, aiM('ai_mcpServiceCallFailed'))
          return core.ok(result.data)
        },
      })
    })
    return core.ok({
      tools: definitions,
      groups: [
        {
          id: 'mcp',
          title: 'MCP',
          tools: definitions.map(tool => tool.name),
        },
      ],
    })
  }
  catch (cause) {
    return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'), cause)
  }
}
