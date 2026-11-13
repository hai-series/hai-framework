import type { MCPExternalServer } from '../ai-config.js'
import type { MCPServiceBindingRequest, MCPServiceBroker, MCPServiceBrokerOptions, MCPServiceOperations } from './ai-mcp-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { addAbortListener } from 'node:events'
import { err, ok } from '@h-ai/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { z } from 'zod'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { StreamableHTTPServerTransport } from './ai-mcp-server.js'

const id = z.string().trim().min(1).max(128)
const bindingSchema = z.strictObject({
  principal: z.strictObject({ tenantId: id, userId: id }),
  taskId: id,
  tools: z.array(z.strictObject({
    id: z.string().regex(/^[\w.-]{1,128}$/),
    serviceId: id,
    tool: id,
    description: z.string().min(1).max(4096),
    inputSchema: ToolSchema.shape.inputSchema,
  })).min(1).max(64),
  ttlMs: z.number().int().min(1).max(86_400_000).optional(),
  signal: z.instanceof(AbortSignal).optional(),
})
const maxRequestBytes = 1024 * 1024
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * 创建执行节点本地的短期工具绑定，原生 Agent 只接触此入口。
 * @example
 * ```ts
 * // 模块内部上下文：read 查工具目录，invoke 由服务操作工厂组装。
 * function mount(read: (id: string) => Promise<MCPExternalServer | undefined>, invoke: MCPServiceOperations['invoke'], options: MCPServiceBrokerOptions) { return createMCPServiceBroker(read, invoke, options, new AbortController().signal) }
 * ```
 */
export function createMCPServiceBroker(
  read: (id: string) => Promise<MCPExternalServer | undefined>,
  invoke: MCPServiceOperations['invoke'],
  options: MCPServiceBrokerOptions,
  lifecycle: AbortSignal,
) {
  const endpoint = URL.parse(options?.url)
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || typeof options.authorize !== 'function')
    return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))

  const grants = new Map<string, NonNullable<ReturnType<typeof createGrant>>>()
  const validator = new AjvJsonSchemaValidator()
  let closed = false

  function createGrant(input: z.output<typeof bindingSchema>, key: string) {
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      lifecycle,
      AbortSignal.timeout(input.ttlMs ?? 900_000),
      ...(input.signal
        ? [input.signal]
        : []),
    ])
    if (signal.aborted)
      return undefined
    const listener = addAbortListener(signal, () => {
      grants.delete(key)
      listener[Symbol.dispose]()
    })
    return {
      input,
      signal,
      revoke: () => controller.abort(),
    }
  }

  function failure() {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: aiM('ai_mcpServiceForbidden'),
        },
      ],
    }
  }

  const broker: MCPServiceBroker = {
    async bind(request: MCPServiceBindingRequest) {
      if (closed || lifecycle.aborted)
        return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
      try {
        const parsed = bindingSchema.safeParse(request)
        if (!parsed.success || new Set(parsed.data.tools.map(tool => tool.id)).size !== parsed.data.tools.length)
          return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
        if (Buffer.byteLength(JSON.stringify(parsed.data.tools)) > maxRequestBytes)
          return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
        const input = parsed.data
        const services = new Map<string, MCPExternalServer | undefined>()
        for (const tool of input.tools) {
          if (!services.has(tool.serviceId))
            services.set(tool.serviceId, await read(tool.serviceId))
          const service = services.get(tool.serviceId)
          if (!service || !['http', 'job'].includes(service.transport) || !service.allowedTools?.includes(tool.tool))
            return err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
          validator.getValidator(tool.inputSchema)
        }
        if (closed || lifecycle.aborted)
          return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
        if (grants.size >= 1024)
          return err(HaiAIError.RESOURCE_OPERATION_FAILED, aiM('ai_resourceOperationFailed'))
        const token = randomBytes(32).toString('base64url')
        const key = digest(token)
        const grant = createGrant({
          ...input,
          tools: structuredClone(input.tools),
        }, key)
        if (!grant)
          return err(HaiAIError.MCP_TOOL_CANCELLED, aiM('ai_mcpServiceCancelled'))
        grants.set(key, grant)
        return ok({
          servers: [
            {
              type: 'http' as const,
              name: 'hai-tools',
              url: endpoint.href,
              headers: [
                { name: 'Authorization', value: `Bearer ${token}` },
              ],
            },
          ],
          revoke: grant.revoke,
        })
      }
      catch {
        return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
      }
    },
    async handleRequest(request, response) {
      if (request.url !== endpoint.pathname) {
        response.writeHead(404).end()
        return
      }
      const token = /^Bearer ([\w-]{43})$/i.exec(request.headers.authorization ?? '')?.[1]
      const grant = !closed && token
        ? grants.get(digest(token))
        : undefined
      if (!grant || grant.signal.aborted) {
        response.writeHead(401).end()
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' }).end()
        return
      }
      const disconnected = new AbortController()
      const onClose = () => disconnected.abort()
      response.once('close', onClose)
      const signal = AbortSignal.any([grant.signal, disconnected.signal])
      const bodySignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(10_000),
      ])
      const stopRead = addAbortListener(bodySignal, () => {
        if (!request.complete)
          request.destroy()
      })
      const server = new Server({ name: 'hai-tools', version: '1.0.0' }, {
        capabilities: { tools: {} },
      })
      const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
      try {
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of request.iterator({ destroyOnReturn: false })) {
          bodySignal.throwIfAborted()
          const part = Buffer.from(chunk)
          bytes += part.byteLength
          if (bytes > maxRequestBytes) {
            response.writeHead(413, { Connection: 'close' }).end()
            return
          }
          chunks.push(part)
        }
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        server.setRequestHandler(ListToolsRequestSchema, () => ({
          tools: grant.input.tools.map(({ id, description, inputSchema }) => ({ name: id, description, inputSchema })),
        }))
        server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
          const tool = grant.input.tools.find(tool => tool.id === params.name)
          if (!tool || signal.aborted || !validator.getValidator(tool.inputSchema)(params.arguments ?? {}).valid)
            return failure()
          const result = await invoke({ serviceId: tool.serviceId, tool: tool.tool, arguments: params.arguments }, {
            principal: grant.input.principal,
            taskId: grant.input.taskId,
            signal,
            authorize: input => options.authorize({ ...input, taskId: grant.input.taskId }),
          })
          if (!result.success) {
            return {
              isError: true,
              content: [
                { type: 'text' as const, text: result.error.message },
              ],
            }
          }
          return { content: result.data.content, structuredContent: result.data.structuredContent }
        })
        signal.throwIfAborted()
        await server.connect(transport)
        await transport.handleRequest(request, response, body)
      }
      catch {
        if (!response.headersSent)
          response.writeHead(signal.aborted ? 401 : 400)
        if (!response.writableEnded)
          response.end()
      }
      finally {
        stopRead[Symbol.dispose]()
        response.off('close', onClose)
        await server.close().catch(() => undefined)
      }
    },
    close() {
      closed = true
      for (const grant of grants.values())
        grant.revoke()
      grants.clear()
    },
  }
  return ok(broker)
}
