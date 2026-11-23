import type { HaiResult } from '@h-ai/core'
import type { ToolDefinition } from '@h-ai/tools'
import type { MCPExternalServer } from '../ai-config.js'
import type { MCPServiceBindingRequest, MCPServiceBroker, MCPServiceBrokerOptions, MCPServiceOperations } from './ai-mcp-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { addAbortListener } from 'node:events'
import { core } from '@h-ai/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { z } from 'zod'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { projectToolProtocolSchema } from '../tools/ai-tools-protocol-schema.js'
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
/**
 * 本地服务只复用现有短期绑定；不登记伪外部端点或额外授权状态。
 * @example 模块内部上下文
 * ```ts
 * function serviceId(service: MCPBrokerLocalService) { return service.id }
 * ```
 */
export interface MCPBrokerLocalService {
  id: string
  catalog: (principal: MCPServiceBindingRequest['principal'], taskId: string, signal?: AbortSignal) => Promise<HaiResult<ToolDefinition[]>>
  invoke: (request: Parameters<MCPServiceOperations['invoke']>[0], authorization: Parameters<MCPServiceOperations['invoke']>[1], idempotencyKey: string) => ReturnType<MCPServiceOperations['invoke']>
}

const maxRequestBytes = 1024 * 1024
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
/**
 * 绑定有效期内使用的单工具输入校验函数。
 * @example
 * ```ts
 * // 模块内部上下文
 * function validateInput(validate: ToolValidator, input: unknown) { return validate(input) }
 * ```
 */
type ToolValidator = ReturnType<AjvJsonSchemaValidator['getValidator']>

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
  local?: MCPBrokerLocalService,
) {
  const endpoint = URL.parse(options?.url)
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || typeof options.authorize !== 'function')
    return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))

  const grants = new Map<string, NonNullable<ReturnType<typeof createGrant>>>()
  let closed = false

  function createGrant(input: z.output<typeof bindingSchema>, validators: Map<string, ToolValidator>, key: string) {
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
      validators,
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
        return core.err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
      try {
        const parsed = bindingSchema.safeParse(request)
        if (!parsed.success || new Set(parsed.data.tools.map(tool => tool.id)).size !== parsed.data.tools.length)
          return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
        if (Buffer.byteLength(JSON.stringify(parsed.data.tools)) > maxRequestBytes)
          return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
        const input = {
          ...parsed.data,
          tools: structuredClone(parsed.data.tools),
        }
        const services = new Map<string, MCPExternalServer | undefined>()
        const validators = new Map<string, ToolValidator>()
        for (const tool of input.tools) {
          if (local?.id === tool.serviceId) {
            const catalog = await local.catalog(input.principal, input.taskId, input.signal)
            const actual = catalog.success
              ? catalog.data.find(item => item.name === tool.tool)
              : undefined
            if (!actual || actual.description !== tool.description || JSON.stringify(actual.inputSchema) !== JSON.stringify(tool.inputSchema))
              return core.err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
          }
          else {
            if (!services.has(tool.serviceId))
              services.set(tool.serviceId, await read(tool.serviceId))
            const service = services.get(tool.serviceId)
            if (!service || !['http', 'job'].includes(service.transport) || !service.allowedTools?.includes(tool.tool))
              return core.err(HaiAIError.MCP_TOOL_FORBIDDEN, aiM('ai_mcpServiceForbidden'))
          }
          // 每个工具独占编译命名空间，允许不同 Schema 使用同一个 $id。
          validators.set(tool.id, new AjvJsonSchemaValidator().getValidator(tool.inputSchema))
        }
        if (closed || lifecycle.aborted)
          return core.err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
        if (grants.size >= 1024)
          return core.err(HaiAIError.RESOURCE_OPERATION_FAILED, aiM('ai_resourceOperationFailed'))
        const token = randomBytes(32).toString('base64url')
        const key = digest(token)
        const grant = createGrant(input, validators, key)
        if (!grant)
          return core.err(HaiAIError.MCP_TOOL_CANCELLED, aiM('ai_mcpServiceCancelled'))
        grants.set(key, grant)
        return core.ok({
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
          signal: grant.signal,
        })
      }
      catch {
        return core.err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
      }
    },
    async handleRequest(request, response) {
      if (request.url !== endpoint.pathname) {
        response.writeHead(404).end()
        return
      }
      const token = /^Bearer ([\w-]{43})$/i.exec(request.headers.authorization ?? '')?.[1]
      const tokenKey = token
        ? digest(token)
        : undefined
      const grant = !closed && tokenKey
        ? grants.get(tokenKey)
        : undefined
      if (!grant || !tokenKey || grant.signal.aborted) {
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
        server.setRequestHandler(ListToolsRequestSchema, async () => {
          let definitions = grant.input.tools
          if (local) {
            const catalog = await local.catalog(grant.input.principal, grant.input.taskId, signal)
            const available = new Set(catalog.success
              ? catalog.data.map(tool => tool.name)
              : [])
            definitions = definitions.filter(tool => tool.serviceId !== local.id || available.has(tool.tool))
          }
          return {
            tools: definitions.map(({ id, description, inputSchema }) => ({
              name: id,
              description,
              inputSchema: projectToolProtocolSchema(inputSchema),
            })),
          }
        })
        server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
          const tool = grant.input.tools.find(tool => tool.id === params.name)
          if (!tool || signal.aborted || !grant.validators.get(params.name)?.(params.arguments ?? {}).valid)
            return failure()
          const request = { serviceId: tool.serviceId, tool: tool.tool, arguments: params.arguments }
          const authorization: Parameters<MCPServiceOperations['invoke']>[1] = {
            principal: grant.input.principal,
            taskId: grant.input.taskId,
            signal,
            authorize: input => options.authorize({ ...input, taskId: grant.input.taskId }),
          }
          const result = local?.id === tool.serviceId
            ? await local.invoke(request, authorization, digest(`${tokenKey}:${String(extra.requestId)}`))
            : await invoke(request, authorization)
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
  return core.ok(broker)
}
