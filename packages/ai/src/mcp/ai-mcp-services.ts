import type { RunnerFunctions } from '@h-ai/runner'
import type { MCPExternalServer } from '../ai-config.js'
import type { MCPJobFiles, MCPServiceOperations } from './ai-mcp-types.js'
import { Buffer } from 'node:buffer'
import { addAbortListener } from 'node:events'
import process from 'node:process'
import { err, ok } from '@h-ai/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createMCPServiceBroker } from './ai-mcp-broker.js'
import { createMCPJobs } from './ai-mcp-jobs.js'

const id = z.string().trim().min(1).max(128)
const requestSchema = z.strictObject({
  serviceId: id,
  tool: id,
  arguments: z.record(z.string(), z.json()).optional(),
})
const principalSchema = z.strictObject({ tenantId: id, userId: id })
const forbiddenHeaders = /^(?:accept|connection|content-length|content-type|cookie|forwarded|host|origin|proxy-.*|transfer-encoding|mcp-.*|x-forwarded-.*)$/i
const maxInputBytes = 1024 * 1024
const maxResponseBytes = 8 * 1024 * 1024

/**
 * 读取现有 MCP 目录，按主体和工具参数授权后才连接固定端点。
 * @example
 * ```ts
 * // 模块内部上下文：get 读取当前配置与数据库合并后的 MCP 服务。
 * function wire(get: (id: string) => Promise<MCPExternalServer | undefined>) { return createMCPServiceOperations(get).operations }
 * ```
 */
export function createMCPServiceOperations(
  read: (id: string) => Promise<MCPExternalServer | undefined>,
  runner?: RunnerFunctions,
  files?: MCPJobFiles,
  configuredServices: readonly MCPExternalServer[] = [],
) {
  const lifecycle = new AbortController()
  const warmServices = configuredServices.filter(service => service.transport === 'job' && service.pool?.maxTotal !== undefined)
  if (warmServices.length && (!runner || !files))
    throw new Error('Managed MCP warm pools require a runner and file access policy')
  const jobs = runner && files
    ? createMCPJobs(read, runner, files, warmServices)
    : undefined
  const operations: MCPServiceOperations = {
    createBroker: options => lifecycle.signal.aborted
      ? err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
      : createMCPServiceBroker(read, operations.invoke, options, lifecycle.signal),
    async invoke(request, authorization) {
      if (lifecycle.signal.aborted)
        return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
      let connected = false
      let timeout: AbortSignal | undefined
      let transport: StreamableHTTPClientTransport | undefined
      let client: Client | undefined
      let fetchSignal: AbortSignal | undefined
      try {
        const parsed = requestSchema.safeParse(request)
        const principal = principalSchema.safeParse(authorization?.principal)
        if (!parsed.success || !principal.success || Buffer.byteLength(JSON.stringify(parsed.data)) > maxInputBytes)
          return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
        if (authorization.signal?.aborted)
          return err(HaiAIError.MCP_TOOL_CANCELLED, aiM('ai_mcpServiceCancelled'))
        const input = parsed.data
        const service = await read(input.serviceId)
        if (!service?.allowedTools?.includes(input.tool) || typeof authorization.authorize !== 'function')
          return err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
        if (service.transport === 'job' && !jobs)
          return err(HaiAIError.MCP_CONNECTION_ERROR, aiM('ai_mcpServiceConnectionFailed'))
        if (service.transport !== 'job' && (service.transport !== 'http' || !service.url))
          return err(HaiAIError.MCP_PROTOCOL_ERROR, aiM('ai_mcpServiceConnectionFailed'))

        const timeoutMs = service.timeoutMs ?? 30_000
        timeout = AbortSignal.timeout(timeoutMs)
        const signal = AbortSignal.any([
          timeout,
          lifecycle.signal,
          ...(authorization.signal
            ? [authorization.signal]
            : []),
        ])
        fetchSignal = signal
        signal.throwIfAborted()
        let listener: ReturnType<typeof addAbortListener> | undefined
        const aborted = new Promise<never>((_, reject) => {
          listener = addAbortListener(signal, () => reject(signal.reason))
        })
        let allowed: boolean
        try {
          const decision = authorization.authorize({
            ...structuredClone(input),
            principal: principal.data,
            signal,
          })
          allowed = await Promise.race([decision, aborted])
        }
        finally {
          listener?.[Symbol.dispose]()
        }
        if (allowed !== true)
          return err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
        // 审批可以等待，期间变动的注册条目需要重新取得授权。
        if (JSON.stringify(await read(input.serviceId)) !== JSON.stringify(service))
          return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
        signal.throwIfAborted()

        if (service.transport === 'job' && jobs) {
          connected = true
          return ok(await jobs.invoke(service, input, principal.data, authorization.taskId, signal))
        }
        if (!service.url)
          return err(HaiAIError.MCP_PROTOCOL_ERROR, aiM('ai_mcpServiceConnectionFailed'))
        const url = new URL(service.url)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
          return err(HaiAIError.MCP_PROTOCOL_ERROR, aiM('ai_mcpServiceConnectionFailed'))
        const headers = new Headers()
        for (const [key, reference] of Object.entries(service.headerEnv)) {
          const value = process.env[reference]
          if (!value || forbiddenHeaders.test(key))
            return err(HaiAIError.MCP_CONNECTION_ERROR, aiM('ai_mcpServiceConnectionFailed'))
          headers.set(key, value)
        }
        let received = 0
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: { headers, redirect: 'error' },
          async fetch(input, init) {
            const target = new URL(input)
            if (target.href !== url.href)
              throw new Error('MCP endpoint mismatch')
            const response = await fetch(target, {
              ...init,
              redirect: 'error',
              signal: AbortSignal.any([
                fetchSignal!,
                ...(init?.signal
                  ? [init.signal]
                  : []),
              ]),
            })
            if (!response.body)
              return response
            const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                received += chunk.byteLength
                if (received > maxResponseBytes)
                  throw new Error('MCP response limit exceeded')
                controller.enqueue(chunk)
              },
            }))
            return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
          },
          reconnectionOptions: {
            maxReconnectionDelay: 0,
            initialReconnectionDelay: 0,
            reconnectionDelayGrowFactor: 1,
            maxRetries: 0,
          },
        })
        client = new Client({ name: 'hai-ai', version: '1.0.0' })
        await client.connect(transport, { signal, timeout: timeoutMs })
        connected = true
        // 握手可能等待远端响应；发出工具调用前复核同一授权对象仍在目录中。
        if (JSON.stringify(await read(input.serviceId)) !== JSON.stringify(service))
          return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
        signal.throwIfAborted()
        const result = CallToolResultSchema.parse(await client.callTool({ name: input.tool, arguments: input.arguments }, CallToolResultSchema, { signal, timeout: timeoutMs }))
        return result.isError
          ? err(HaiAIError.MCP_TOOL_ERROR, aiM('ai_mcpServiceCallFailed'))
          : ok(result)
      }
      catch {
        if (timeout?.aborted)
          return err(HaiAIError.TIMEOUT, aiM('ai_requestTimeout'))
        if (lifecycle.signal.aborted || authorization?.signal?.aborted)
          return err(HaiAIError.MCP_TOOL_CANCELLED, aiM('ai_mcpServiceCancelled'))
        return connected
          ? err(HaiAIError.MCP_TOOL_ERROR, aiM('ai_mcpServiceCallFailed'))
          : err(HaiAIError.MCP_CONNECTION_ERROR, aiM('ai_mcpServiceConnectionFailed'))
      }
      finally {
        // 结束远端会话时使用独立短期限。清理失败不能覆盖已知的工具结果。
        fetchSignal = AbortSignal.timeout(1000)
        await transport?.terminateSession().catch(() => undefined)
        await client?.close().catch(() => undefined)
      }
    },
  }
  return {
    operations,
    close() {
      lifecycle.abort()
      jobs?.close()
    },
  }
}
