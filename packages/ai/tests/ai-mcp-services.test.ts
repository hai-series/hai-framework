import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import process from 'node:process'
import { promisify } from 'node:util'
import { reldb } from '@h-ai/reldb'
import { createRunner } from '@h-ai/runner'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai, createMcpServer, HaiAIError, MCPExternalServerSchema, StreamableHTTPServerTransport } from '../src/index.js'

const principal = { tenantId: 'tenant', userId: 'ada' }
const request = {
  serviceId: 'docs',
  tool: 'echo',
  arguments: { text: 'hello' },
}

async function remoteMcp(onInitialize?: () => Promise<void>) {
  const requests: Array<{ method?: string, path?: string, authorization?: string, sessionId?: string }> = []
  const sessions = new Map<string, StreamableHTTPServerTransport>()
  const close: Array<() => Promise<void>> = []
  const invoke = vi.fn((text: string) => text)
  const http = createServer(async (req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      sessionId: typeof req.headers['mcp-session-id'] === 'string'
        ? req.headers['mcp-session-id']
        : undefined,
    })
    if (req.url === '/redirect') {
      res.writeHead(307, { location: '/mcp' }).end()
      return
    }
    try {
      const id = req.headers['mcp-session-id']
      let transport = typeof id === 'string'
        ? sessions.get(id)
        : undefined
      if (!id && req.method === 'POST') {
        await onInitialize?.()
        const server = createMcpServer({ name: 'fixture' })
        server.registerTool('echo', {
          inputSchema: {
            text: z.string(),
          },
        }, async ({ text }) => ({
          content: [
            {
              type: 'text',
              text: invoke(text),
            },
          ],
        }))
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: id => sessions.set(id, transport!),
          onsessionclosed: id => sessions.delete(id),
        })
        close.push(() => server.close())
        await server.connect(transport)
      }
      if (!transport) {
        res.writeHead(404).end()
        return
      }
      await transport.handleRequest(req, res)
    }
    catch {
      if (!res.headersSent)
        res.writeHead(500)
      res.end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(0, '127.0.0.1', resolve)
  })
  const address = http.address()
  if (!address || typeof address === 'string')
    throw new Error('MCP fixture did not bind')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    invoke,
    close: async () => {
      await Promise.allSettled(close.map(stop => stop()))
      http.closeAllConnections()
      await new Promise<void>(resolve => http.close(() => resolve()))
    },
  }
}

describe('ai.mcp.services', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await ai.close()
  })

  it('does not dispatch an upstream tool after catalog revocation during the handshake', async () => {
    let release: (() => void) | undefined
    const pause = new Promise<void>((resolve) => {
      release = resolve
    })
    const initializing = vi.fn(() => pause)
    const remote = await remoteMcp(initializing)
    try {
      expect((await ai.init()).success).toBe(true)
      const registered = await ai.mcp.servers.register({
        id: 'docs',
        name: 'Docs',
        transport: 'http',
        url: `${remote.origin}/mcp`,
        allowedTools: ['echo'],
      })
      expect(registered.success).toBe(true)
      const pending = ai.mcp.services.invoke(request, {
        principal,
        authorize: () => true,
      })
      await expect.poll(() => initializing.mock.calls.length).toBe(1)
      expect((await ai.mcp.servers.remove('docs')).success).toBe(true)
      release?.()
      expect(await pending).toMatchObject({
        success: false,
        error: { code: HaiAIError.RESOURCE_CONFLICT.code },
      })
      expect(remote.invoke).not.toHaveBeenCalled()
    }
    finally {
      release?.()
      await remote.close()
    }
  })

  it('uses registered Streamable HTTP and isolates remote sessions per call', async () => {
    const remote = await remoteMcp()
    try {
      vi.stubEnv('HAI_TEST_MCP_AUTH', 'Bearer fixture-auth')
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'http',
              url: `${remote.origin}/mcp`,
              headerEnv: { Authorization: 'HAI_TEST_MCP_AUTH' },
              allowedTools: ['echo'],
            },
          ],
        },
      })).success).toBe(true)
      const authorize = vi.fn(() => true)
      for (const userId of ['ada', 'lin']) {
        const result = await ai.mcp.services.invoke(request, {
          principal: { ...principal, userId },
          authorize,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.content).toEqual([
            { type: 'text', text: 'hello' },
          ])
        }
      }
      expect(authorize).toHaveBeenCalledTimes(2)
      expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ principal, ...request }))
      expect(remote.invoke).toHaveBeenCalledTimes(2)
      expect(remote.requests.every(item => item.authorization === 'Bearer fixture-auth')).toBe(true)
      const closed = remote.requests.filter(item => item.method === 'DELETE').map(item => item.sessionId)
      expect(closed).toHaveLength(2)
      expect(new Set(closed).size).toBe(2)
    }
    finally {
      await remote.close()
    }
  })

  it('rejects a disallowed tool, principal, or request override before the network', async () => {
    const remote = await remoteMcp()
    try {
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'http',
              url: `${remote.origin}/mcp`,
              allowedTools: ['echo'],
            },
          ],
        },
      })).success).toBe(true)
      const authorize = vi.fn(() => false)
      for (const input of [
        { ...request, tool: 'delete' },
        request,
      ]) {
        const result = await ai.mcp.services.invoke(input, { principal, authorize })
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiAIError.MCP_TOOL_FORBIDDEN.code)
      }
      const override = { ...request, url: `${remote.origin}/mcp` }
      expect((await ai.mcp.services.invoke(override, {
        principal,
        authorize: () => true,
      })).success).toBe(false)
      expect(authorize).toHaveBeenCalledTimes(1)
      expect(remote.requests).toHaveLength(0)
    }
    finally {
      await remote.close()
    }
  })

  it('blocks redirects and redacts connection failures', async () => {
    const remote = await remoteMcp()
    try {
      vi.stubEnv('HAI_TEST_MCP_AUTH', 'Bearer fixture-auth')
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'http',
              url: `${remote.origin}/redirect`,
              headerEnv: { Authorization: 'HAI_TEST_MCP_AUTH' },
              allowedTools: ['echo'],
            },
          ],
        },
      })).success).toBe(true)
      const result = await ai.mcp.services.invoke(request, {
        principal,
        authorize: () => true,
      })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiAIError.MCP_CONNECTION_ERROR.code)
      expect(JSON.stringify(result)).not.toContain('fixture-auth')
      expect(remote.requests.map(item => item.path)).toEqual(['/redirect'])
    }
    finally {
      await remote.close()
    }
  })

  it('scopes MCP discovery and calls to a revocable task bearer', async () => {
    const remote = await remoteMcp()
    const authorize = vi.fn(() => true)
    let broker: import('../src/index.js').MCPServiceBroker | undefined
    const brokerServer = createServer((req, res) => {
      if (!broker) {
        res.writeHead(503).end()
        return
      }
      void broker.handleRequest(req, res)
    })
    const client = new Client({ name: 'fixture-agent', version: '1' })
    try {
      await new Promise<void>(resolve => brokerServer.listen(0, '127.0.0.1', resolve))
      const address = brokerServer.address()
      if (!address || typeof address === 'string')
        throw new Error('Broker fixture did not bind')
      const url = new URL(`http://127.0.0.1:${address.port}/mcp`)
      vi.stubEnv('HAI_TEST_MCP_AUTH', 'Bearer upstream-secret')
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'http',
              url: `${remote.origin}/mcp`,
              headerEnv: { Authorization: 'HAI_TEST_MCP_AUTH' },
              allowedTools: ['echo'],
            },
          ],
        },
      })).success).toBe(true)
      const created = ai.mcp.services.createBroker({ url: url.href, authorize })
      expect(created.success).toBe(true)
      if (!created.success)
        return
      broker = created.data
      expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401)
      const bound = await broker.bind({
        principal,
        taskId: 'task-a',
        tools: [
          {
            id: 'documents_echo',
            serviceId: 'docs',
            tool: 'echo',
            description: 'Echo text',
            inputSchema: {
              type: 'object',
              properties: {
                text: { type: 'string' },
              },
              required: ['text'],
            },
          },
        ],
      })
      expect(bound.success).toBe(true)
      if (!bound.success)
        return
      const server = bound.data.servers[0]!
      expect(JSON.stringify(server)).not.toContain('upstream-secret')
      const headers = Object.fromEntries(server.headers.map(({ name, value }) => [name, value]))
      await client.connect(new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      }))
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['documents_echo'])
      expect(await client.callTool({
        name: 'echo',
        arguments: { text: 'secret' },
      })).toMatchObject({ isError: true })
      expect(await client.callTool({
        name: 'documents_echo',
        arguments: { text: 4 },
      })).toMatchObject({ isError: true })
      expect(remote.requests).toHaveLength(0)
      expect(await client.callTool({
        name: 'documents_echo',
        arguments: { text: 'hello' },
      })).toMatchObject({
        content: [
          { type: 'text', text: 'hello' },
        ],
      })
      expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ principal, taskId: 'task-a', ...request }))
      bound.data.revoke()
      expect((await fetch(url, { method: 'POST', headers, body: '{}' })).status).toBe(401)
      expect(remote.invoke).toHaveBeenCalledTimes(1)
    }
    finally {
      await client.close()
      broker?.close()
      brokerServer.closeAllConnections()
      await new Promise<void>(resolve => brokerServer.close(() => resolve()))
      await remote.close()
    }
  })

  it('rejects job calls without the trusted file and runner dependencies', async () => {
    expect((await ai.init({
      mcp: {
        servers: [
          {
            id: 'docs',
            name: 'Docs',
            transport: 'job',
            environmentId: 'documents-job',
            allowedTools: ['documents.extract'],
          },
        ],
      },
    })).success).toBe(true)
    const result = await ai.mcp.services.invoke({
      serviceId: 'docs',
      tool: 'documents.extract',
      arguments: { fileId: 'private-document' },
    }, {
      principal,
      authorize: () => true,
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.MCP_CONNECTION_ERROR.code)
  })

  it('validates warm-pool bounds and restricts warm pools to deployment configuration', async () => {
    const service = {
      id: 'docs',
      name: 'Docs',
      transport: 'job',
      environmentId: 'documents-job',
      allowedTools: ['documents.extract'],
      pool: { minReady: 1, maxRunning: 2, maxTotal: 3 },
    } as const
    const config = {
      ...service,
      allowedTools: [...service.allowedTools],
    }
    expect(MCPExternalServerSchema.safeParse(config).success).toBe(true)
    expect(MCPExternalServerSchema.safeParse({
      ...config,
      pool: { minReady: 1, maxRunning: 3, maxTotal: 2 },
    }).success).toBe(false)
    expect(MCPExternalServerSchema.safeParse({
      ...config,
      pool: { minReady: 4, maxRunning: 2, maxTotal: 3 },
    }).success).toBe(false)
    expect(MCPExternalServerSchema.safeParse({
      ...config,
      pool: { minReady: 1, maxRunning: 2 },
    }).success).toBe(false)
    expect((await ai.init()).success).toBe(true)
    expect(await ai.mcp.servers.register(config)).toMatchObject({
      success: false,
      error: { code: HaiAIError.RESOURCE_INVALID.code },
    })
  })

  it('registers a deployment warm pool and submits jobs with its ceiling and tool capacity class', async () => {
    const runner = createRunner()
    const started = await runner.init({
      nodeId: 'tool-capacity-api',
      executor: false,
      environments: [
        {
          id: 'documents-job',
          image: `sha256:${'a'.repeat(64)}`,
          capabilities: ['documents.extract'],
          resources: {
            cpu: 0.5,
            memoryMiB: 192,
            pids: 32,
            scratchMiB: 24,
          },
        },
      ],
    })
    expect(started.success).toBe(true)
    try {
      const unregister = vi.fn()
      const register = vi.spyOn(runner, 'registerWarmPool').mockReturnValue({ success: true, data: unregister })
      const submit = vi.spyOn(runner, 'submit').mockResolvedValue({
        success: true,
        data: {
          id: 'fixture',
          status: 'succeeded',
          createdAt: 0,
          updatedAt: 0,
          output: { text: 'isolated' },
        },
      })
      const service = {
        id: 'docs',
        name: 'Docs',
        transport: 'job',
        environmentId: 'documents-job',
        allowedTools: ['documents.extract'],
      } as const
      expect((await ai.init({
        mcp: {
          servers: [
            {
              ...service,
              allowedTools: [...service.allowedTools],
              pool: { minReady: 1, maxRunning: 2, maxTotal: 3 },
            },
          ],
        },
      }, {
        runner,
        mcpJobFiles: {
          read: vi.fn(),
          publish: vi.fn(),
        },
      })).success).toBe(true)
      expect(register).toHaveBeenCalledWith({
        key: 'docs',
        kind: 'ai-mcp-job',
        environmentId: 'documents-job',
        minReady: 1,
        maxRunning: 2,
        maxTotal: 3,
      })
      const called = await ai.mcp.services.invoke({
        serviceId: 'docs',
        tool: 'documents.extract',
        arguments: { fileId: 'file-1' },
      }, {
        principal,
        authorize: () => true,
      })
      expect(called).toMatchObject({
        success: true,
        data: {
          structuredContent: { text: 'isolated' },
        },
      })
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({
        capacityClass: 'tool',
        concurrency: { key: 'docs', limit: 2 },
        warmPool: true,
      }))
      await ai.close()
      expect(unregister).toHaveBeenCalledTimes(1)
    }
    finally {
      await ai.close()
      await runner.close()
    }
  })

  it('rejects expired task credentials and aborts an authorization wait', async () => {
    const remote = await remoteMcp()
    let broker: import('../src/index.js').MCPServiceBroker | undefined
    const http = createServer((req, res) => {
      if (broker)
        void broker.handleRequest(req, res)
      else
        res.writeHead(503).end()
    })
    try {
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'http',
              url: `${remote.origin}/mcp`,
              allowedTools: ['echo'],
            },
          ],
        },
      })).success).toBe(true)
      await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
      const address = http.address()
      if (!address || typeof address === 'string')
        throw new Error('Broker fixture did not bind')
      const url = `http://127.0.0.1:${address.port}/mcp`
      const created = ai.mcp.services.createBroker({
        url,
        authorize: () => true,
      })
      expect(created.success).toBe(true)
      if (!created.success)
        return
      broker = created.data
      const binding = await broker.bind({
        principal,
        taskId: 'expires',
        ttlMs: 1,
        tools: [
          {
            id: 'echo',
            serviceId: 'docs',
            tool: 'echo',
            description: 'Echo',
            inputSchema: { type: 'object' },
          },
        ],
      })
      expect(binding.success).toBe(true)
      if (!binding.success)
        return
      const headers = Object.fromEntries(binding.data.servers[0]!.headers.map(({ name, value }) => [name, value]))
      await expect.poll(async () => (await fetch(url, { method: 'POST', headers, body: '{}' })).status).toBe(401)

      const controller = new AbortController()
      const authorize = vi.fn(() => new Promise<boolean>(() => {}))
      const pending = ai.mcp.services.invoke(request, { principal, signal: controller.signal, authorize })
      await expect.poll(() => authorize.mock.calls.length).toBe(1)
      controller.abort()
      expect(await pending).toMatchObject({
        success: false,
        error: { code: HaiAIError.MCP_TOOL_CANCELLED.code },
      })
      expect(remote.requests).toHaveLength(0)
    }
    finally {
      broker?.close()
      http.closeAllConnections()
      await new Promise<void>(resolve => http.close(() => resolve()))
      await remote.close()
    }
  })

  it.skipIf(!process.env.HAI_TOOL_IMAGE_DOCUMENTS)('runs an offline document job while the Agent class is full and enforces file ownership', async () => {
    const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
      ? 'docker'
      : 'podman'
    const image = await promisify(execFile)(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      process.env.HAI_TOOL_IMAGE_DOCUMENTS!,
    ])
    const runner = createRunner()
    const started = await runner.init({
      engine,
      nodeId: 'documents-e2e',
      maxRunning: 1,
      maxRunningPerScope: 1,
      environments: [
        {
          id: 'documents-job',
          image: image.stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:'),
          capabilities: ['documents.extract'],
          networkPolicy: 'offline',
          resources: {
            cpu: 0.5,
            memoryMiB: 192,
            pids: 32,
            scratchMiB: 24,
          },
        },
      ],
    })
    expect(started.success).toBe(true)
    let releaseAgent: (() => void) | undefined
    try {
      const agentWork = new Promise<null>((resolve) => {
        releaseAgent = () => resolve(null)
      })
      expect(runner.register('fixture-agent', () => agentWork).success).toBe(true)
      const agent = await runner.submit({ scope: principal, kind: 'fixture-agent', input: null })
      expect(agent.success).toBe(true)
      if (!agent.success)
        return
      await expect.poll(async () => {
        const status = await runner.get(principal, agent.data.id)
        return status.success && status.data.status
      }).toBe('running')
      const read = vi.fn<import('../src/index.js').MCPJobFiles['read']>(async (input) => {
        if (input.principal.userId !== 'ada') {
          return {
            success: false,
            error: { code: HaiAIError.MCP_TOOL_FORBIDDEN.code, message: 'Denied' },
          }
        }
        return {
          success: true,
          data: {
            name: 'input.txt',
            base64: Buffer.from('isolated document job result').toString('base64'),
          },
        }
      })
      const publish = vi.fn<import('../src/index.js').MCPJobFiles['publish']>()
      expect((await ai.init({
        mcp: {
          servers: [
            {
              id: 'docs',
              name: 'Docs',
              transport: 'job',
              environmentId: 'documents-job',
              allowedTools: ['documents.extract'],
            },
          ],
        },
      }, {
        runner,
        mcpJobFiles: { read, publish },
      })).success).toBe(true)
      const invoke = (userId: string) => ai.mcp.services.invoke({
        serviceId: 'docs',
        tool: 'documents.extract',
        arguments: { fileId: 'private-document' },
      }, {
        principal: { ...principal, userId },
        taskId: 'task-docs',
        authorize: () => true,
      })
      const [allowed, denied] = await Promise.all([
        invoke('ada'),
        invoke('lin'),
      ])
      expect(allowed).toMatchObject({
        success: true,
        data: {
          structuredContent: { text: 'isolated document job result' },
        },
      })
      expect(denied).toMatchObject({
        success: false,
        error: { code: HaiAIError.MCP_TOOL_ERROR.code },
      })
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ principal, taskId: 'task-docs', fileId: 'private-document' }))
      expect(publish).not.toHaveBeenCalled()
      expect(await runner.get(principal, agent.data.id)).toMatchObject({
        success: true,
        data: { status: 'running' },
      })
    }
    finally {
      releaseAgent?.()
      await ai.close()
      expect((await runner.close()).success).toBe(true)
    }
  }, 90000)

  it.skipIf(!process.env.HAI_TOOL_IMAGE_OFFICE)('publishes a real Office PDF through the task MCP broker', async () => {
    const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
      ? 'docker'
      : 'podman'
    const exec = promisify(execFile)
    const image = await exec(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      process.env.HAI_TOOL_IMAGE_OFFICE!,
    ])
    // 在已验证镜像中用 Python 标准库生成最小 DOCX，不依赖宿主 Office。
    const fixture = await exec(engine, [
      'run',
      '--rm',
      '--pull=never',
      '--network=none',
      '--entrypoint',
      '/usr/bin/python3',
      process.env.HAI_TOOL_IMAGE_OFFICE!,
      '-I',
      '-S',
      '-c',
      `import base64, io, zipfile
data = io.BytesIO()
with zipfile.ZipFile(data, 'w') as doc:
    doc.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    doc.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    doc.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ACP office artifact</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
print(base64.b64encode(data.getvalue()).decode())`,
    ], { timeout: 15_000 })
    const runner = createRunner()
    const started = await runner.init({
      engine,
      nodeId: 'office-e2e',
      environments: [
        {
          id: 'office-job',
          image: image.stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:'),
          capabilities: ['office.convert'],
          networkPolicy: 'offline',
          resources: {
            cpu: 0.5,
            memoryMiB: 384,
            pids: 64,
            scratchMiB: 192,
          },
        },
      ],
    })
    expect(started.success).toBe(true)
    let broker: import('../src/index.js').MCPServiceBroker | undefined
    const http = createServer((req, res) => {
      if (broker)
        void broker.handleRequest(req, res)
      else
        res.writeHead(503).end()
    })
    const client = new Client({ name: 'office-fixture', version: '1' })
    try {
      const read = vi.fn<import('../src/index.js').MCPJobFiles['read']>(async () => ({
        success: true,
        data: {
          name: 'report.docx',
          base64: fixture.stdout.trim(),
        },
      }))
      const publish = vi.fn<import('../src/index.js').MCPJobFiles['publish']>(async (input) => {
        const pdf = Buffer.from(input.base64, 'base64')
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        expect(pdf.length).toBeGreaterThan(100)
        expect(pdf.toString('ascii', -30)).toContain('%%EOF')
        return {
          success: true,
          data: { fileId: 'converted-report' },
        }
      })
      const initialized = await ai.init({
        mcp: {
          servers: [
            {
              id: 'office',
              name: 'Office',
              transport: 'job',
              environmentId: 'office-job',
              allowedTools: ['office.convert'],
              pool: { minReady: 1, maxRunning: 1, maxTotal: 1 },
            },
          ],
        },
      }, {
        runner,
        mcpJobFiles: { read, publish },
      })
      expect(initialized.success).toBe(true)
      // 验收快照用于核对实际预热容器被交给本次作业，避免冷启动被误记为命中。
      const containerFor = async (condition: 'ready' | 'completed') => {
        const filter = condition === 'ready'
          ? 'warm_state = \'ready\' AND state = \'running\''
          : 'warm_state IS NULL AND state = \'succeeded\' AND pool_fingerprint IS NOT NULL'
        const result = await reldb.sql.get<{ container_json: string | { id: string } }>(
          `SELECT container_json FROM hai_runner_executions WHERE kind = ? AND ${filter}`,
          ['ai-mcp-job'],
        )
        const container = result.success ? result.data?.container_json : undefined
        return typeof container === 'string'
          ? (JSON.parse(container) as { id: string }).id
          : container?.id
      }
      await expect.poll(() => containerFor('ready'), { timeout: 15_000 }).toMatch(/^[a-f\d]{64}$/)
      const warmedContainer = await containerFor('ready')
      await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
      const address = http.address()
      if (!address || typeof address === 'string')
        throw new Error('Broker fixture did not bind')
      const url = new URL(`http://127.0.0.1:${address.port}/mcp`)
      const created = ai.mcp.services.createBroker({
        url: url.href,
        authorize: input => input.taskId === 'task-office' && input.principal.userId === 'ada',
      })
      expect(created.success).toBe(true)
      if (!created.success)
        return
      broker = created.data
      const bound = await broker.bind({
        principal,
        taskId: 'task-office',
        tools: [
          {
            id: 'office_pdf',
            serviceId: 'office',
            tool: 'office.convert',
            description: 'Convert DOCX',
            inputSchema: {
              type: 'object',
              properties: {
                fileId: { type: 'string' },
              },
              required: ['fileId'],
              additionalProperties: false,
            },
          },
        ],
      })
      expect(bound.success).toBe(true)
      if (!bound.success)
        return
      const headers = Object.fromEntries(bound.data.servers[0]!.headers.map(({ name, value }) => [name, value]))
      await client.connect(new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      }))
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['office_pdf'])
      const result = await client.callTool({
        name: 'office_pdf',
        arguments: { fileId: 'report-object' },
      })
      expect(result).toMatchObject({
        structuredContent: { fileId: 'converted-report', name: 'result.pdf' },
      })
      expect(JSON.stringify(result)).not.toContain('JVBERi0')
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ principal, taskId: 'task-office', fileId: 'report-object' }))
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ principal, taskId: 'task-office', name: 'result.pdf' }))
      expect(await containerFor('completed')).toBe(warmedContainer)
      bound.data.revoke()
    }
    finally {
      await client.close()
      broker?.close()
      http.closeAllConnections()
      await new Promise<void>(resolve => http.close(() => resolve()))
      await ai.close()
      expect((await runner.close()).success).toBe(true)
    }
  }, 90000)
})
