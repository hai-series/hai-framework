import type { ToolService } from '@h-ai/tools/server'
import type { BuiltinToolBroker } from '../src/index.js'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { runner as frameworkRunner } from '@h-ai/runner'
import { tools } from '@h-ai/tools/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai } from '../src/index.js'

const scope = { tenantId: 'team', userId: 'alice' }

async function fixture(run: (input: { service: ToolService, broker: BuiltinToolBroker, setEnabled: (value: boolean) => void }) => Promise<void>, network = true) {
  const runner = frameworkRunner.create()
  let broker: BuiltinToolBroker | undefined
  let service: ToolService | undefined
  let enabled = true
  const server = createServer((req, res) => {
    void broker?.handleRequest(req, res)
  })
  try {
    expect((await runner.init({ nodeId: 'local-mcp', pollMs: 10 })).success).toBe(true)
    const created = tools.createService({
      id: 'local-mcp',
      runner,
      enabled: () => ({
        tools: enabled
          ? ['echo']
          : [],
      }),
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name: 'echo',
            description: 'Echo',
            parameters: z.object({
              value: z.string().meta({ format: 'artifact-id' }),
              date: z.string().meta({ format: 'date-time' }).optional(),
            }),
            handler: input => input,
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    service = created.data
    let port = 10000
    if (network) {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('A TCP test endpoint is required')
      port = address.port
    }
    const mounted = ai.tools.createBroker({ service, url: `http://127.0.0.1:${port}/mcp` })
    expect(mounted.success).toBe(true)
    if (!mounted.success)
      throw new Error(mounted.error.message)
    broker = mounted.data
    await run({
      service,
      broker,
      setEnabled: (value) => { enabled = value },
    })
  }
  finally {
    broker?.close()
    service?.close()
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
    await runner.close()
  }
}

describe('ai.tools.createBroker', () => {
  it('沿用默认15分钟，可为长工具绑定20分钟且父取消仍优先', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      await fixture(async ({ broker }) => {
        const standard = await broker.bind({
          scope,
          sessionId: 'default-window',
          tools: ['echo'],
        })
        expect(standard.success).toBe(true)
        expect(timeout).toHaveBeenCalledWith(900_000)
        if (standard.success)
          standard.data.revoke()
        timeout.mockClear()
        const controller = new AbortController()
        const request = {
          scope,
          sessionId: 'long-window',
          tools: ['echo'],
          ttlMs: 1_200_000,
          signal: controller.signal,
        }
        const extended = await broker.bind(request)
        expect(extended.success).toBe(true)
        expect(timeout).toHaveBeenCalledWith(1_200_000)
        if (!extended.success)
          throw new Error(extended.error.message)
        expect(extended.data.signal.aborted).toBe(false)
        controller.abort()
        expect(extended.data.signal.aborted).toBe(true)
      }, false)
    }
    finally { timeout.mockRestore() }
  })

  it('按传入的短TTL使真实绑定到期', async () => {
    await fixture(async ({ broker }) => {
      const request = {
        scope,
        sessionId: 'short-window',
        tools: ['echo'],
        ttlMs: 1,
      }
      const bound = await broker.bind(request)
      expect(bound.success).toBe(true)
      if (!bound.success)
        throw new Error(bound.error.message)
      await vi.waitUntil(() => bound.data.signal.aborted, { timeout: 1000, interval: 5 })
    }, false)
  })

  it.each([0, -1, 1.5, 86_400_001])('拒绝超出既有范围的绑定TTL %s', async (ttlMs) => {
    await fixture(async ({ broker }) => {
      const request = {
        scope,
        sessionId: 'invalid-window',
        tools: ['echo'],
        ttlMs,
      }
      expect((await broker.bind(request)).success).toBe(false)
    }, false)
  })

  it('绑定本地能力时从真实工具服务生成Schema并拒绝不可用名称', async () => {
    await fixture(async ({ broker }) => {
      const bound = await broker.bind({
        scope,
        sessionId: 'task',
        tools: ['echo'],
      })
      expect(bound.success).toBe(true)
      if (bound.success) {
        expect(bound.data.servers[0].headers).toHaveLength(1)
        bound.data.revoke()
      }
      const missing = await broker.bind({
        scope,
        sessionId: 'task',
        tools: ['missing'],
      })
      expect(missing.success).toBe(false)
    }, false)
  })
  it('本地服务通过既有短期绑定与真实 HTTP MCP 调用，不配置伪外部服务', async () => {
    await fixture(async ({ broker, service, setEnabled }) => {
      const bound = await broker.bind({
        scope,
        sessionId: 'task',
        tools: ['echo'],
      })
      expect(bound.success).toBe(true)
      if (!bound.success)
        throw new Error(bound.error.message)
      const connection = bound.data.servers[0]
      const headers = Object.fromEntries(connection.headers.map(header => [header.name, header.value]))
      const client = new Client({ name: 'test', version: '1' })
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), {
          requestInit: { headers },
        }))
        const definitions = (await client.listTools()).tools
        expect(definitions.map(tool => tool.name)).toEqual(['echo'])
        expect(JSON.stringify(definitions)).not.toContain('artifact-id')
        expect(JSON.stringify(definitions)).toContain('date-time')
        const catalog = await service.catalog({ scope })
        expect(catalog.success).toBe(true)
        if (catalog.success)
          expect(JSON.stringify(catalog.data)).toContain('artifact-id')
        const response = await client.callTool({
          name: 'echo',
          arguments: { value: 'hello' },
        })
        expect(response.isError).not.toBe(true)
        expect(response.content).toEqual([
          { type: 'text', text: '{"value":"hello"}' },
        ])
        setEnabled(false)
        expect((await client.listTools()).tools).toEqual([])
        expect((await client.callTool({
          name: 'echo',
          arguments: { value: 'no' },
        })).isError).toBe(true)
      }
      finally { await client.close() }
    })
  })
})
