/**
 * @h-ai/ai — 模型工具协议适配
 *
 * 将模型 function calling 转为中立工具调用；执行、授权和取消仅由 Tools 内核负责。
 * @module ai-llm-tool
 */

import type { HaiResult } from '@h-ai/core'
import type { ToolRegistryOperations as NeutralToolRegistryOperations, ToolInvocation } from '@h-ai/tools'
import type { ToolCall, ToolMessage, ToolRegistryOperations } from './ai-llm-types.js'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { projectToolProtocolSchema } from '../tools/ai-tools-protocol-schema.js'

const logger = core.logger.child({ module: 'ai', scope: 'tool-protocol' })

/** 模型入参只在协议层解析 JSON；业务 Schema 仍由中立工具校验。 */
function decodeCall(call: ToolCall): HaiResult<ToolInvocation> {
  if (call.type !== 'function')
    return core.err(HaiAIError.TOOL_PROTOCOL_ERROR, aiM('ai_toolInvalidCall'))
  try {
    const input: unknown = JSON.parse(call.function.arguments)
    return core.ok({ name: call.function.name, input })
  }
  catch (cause) {
    return core.err(HaiAIError.TOOL_PROTOCOL_ERROR, aiM('ai_toolInvalidJson'), cause)
  }
}

/** 编码失败保留内部原因，消息和日志不包含结果正文。 */
function encodeResult(call: ToolCall, output: unknown): HaiResult<ToolMessage> {
  try {
    const content = typeof output === 'string'
      ? output
      : JSON.stringify(output === undefined
          ? null
          : output)
    if (typeof content !== 'string')
      throw new TypeError('Tool output is not JSON serializable')
    return core.ok({ role: 'tool', tool_call_id: call.id, content })
  }
  catch (cause) {
    logger.error('Tool result encoding failed', { code: HaiAIError.TOOL_RESULT_ERROR.code })
    return core.err(HaiAIError.TOOL_RESULT_ERROR, aiM('ai_toolInvalidResult'), cause)
  }
}

/**
 * 将现有中立注册表接入模型协议。每次读取和执行都使用原注册表。
 * @param registry - 使用 tools.createRegistry() 创建的注册表
 * @returns 仅提供模型定义与协议调用的适配器
 * @example 模块内部上下文
 * ```ts
 * function expose(registry: NeutralToolRegistryOperations) {
 *   return adaptToolRegistry(registry).getDefinitions()
 * }
 * ```
 */
export function adaptToolRegistry(registry: NeutralToolRegistryOperations): ToolRegistryOperations {
  return {
    getDefinitions: () => registry.getDefinitions().map(definition => ({
      type: 'function',
      function: {
        name: definition.name,
        description: definition.description,
        parameters: projectToolProtocolSchema(definition.inputSchema),
      },
    })),
    async execute(call, options) {
      const decoded = decodeCall(call)
      if (!decoded.success)
        return decoded
      const result = await registry.execute(decoded.data.name, decoded.data.input, options)
      if (!result.success)
        return result
      return encodeResult(call, result.data)
    },
    async executeAll(calls, options) {
      const invocations: ToolInvocation[] = []
      for (const call of calls) {
        const decoded = decodeCall(call)
        if (!decoded.success)
          return decoded
        invocations.push(decoded.data)
      }
      const result = await registry.executeAll(invocations, options)
      if (!result.success)
        return result
      const messages: ToolMessage[] = []
      for (const [index, output] of result.data.entries()) {
        const encoded = encodeResult(calls[index], output)
        if (!encoded.success)
          return encoded
        messages.push(encoded.data)
      }
      return core.ok(messages)
    },
  }
}
