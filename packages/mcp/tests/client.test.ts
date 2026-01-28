/**
 * =============================================================================
 * @hai/mcp - 客户端测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMCPClient, InMemoryTransport } from '../src/client.js'
import { createMCPServer } from '../src/server.js'

describe('MCPClient', () => {
  /**
   * 创建测试环境
   */
  function createTestEnv() {
    const server = createMCPServer({
      name: 'test-server',
      version: '1.0.0',
    })
    
    const client = createMCPClient({
      name: 'test-client',
      version: '1.0.0',
    })
    
    const transport = new InMemoryTransport()
    
    // 设置传输层处理器
    transport.registerHandler('initialize', () => ({
      protocolVersion: '2024-11-05',
      serverInfo: server.getServerInfo(),
      capabilities: server.getCapabilities(),
    }))
    
    transport.registerHandler('notifications/initialized', () => undefined)
    
    transport.registerHandler('tools/list', () => ({
      tools: server.listTools(),
    }))
    
    transport.registerHandler('tools/call', async (params: any) => {
      return server.callTool(params.name, params.arguments)
    })
    
    transport.registerHandler('resources/list', () => ({
      resources: server.listResources(),
    }))
    
    transport.registerHandler('resources/read', async (params: any) => {
      const content = await server.readResource(params.uri)
      return { contents: content ? [content] : [] }
    })
    
    transport.registerHandler('prompts/list', () => ({
      prompts: server.listPrompts(),
    }))
    
    transport.registerHandler('prompts/get', async (params: any) => {
      const messages = await server.getPrompt(params.name, params.arguments)
      return { messages: messages ?? [] }
    })
    
    return { server, client, transport }
  }
  
  describe('连接管理', () => {
    it('应该创建客户端实例', () => {
      const client = createMCPClient({
        name: 'test-client',
        version: '1.0.0',
      })
      
      expect(client).toBeDefined()
      expect(client.getClientInfo().name).toBe('test-client')
    })
    
    it('应该连接到服务端', async () => {
      const { client, transport } = createTestEnv()
      
      const result = await client.connect(transport)
      
      expect(result.isOk()).toBe(true)
      expect(client.isConnected()).toBe(true)
      
      const serverInfo = client.getServerInfo()
      expect(serverInfo?.name).toBe('test-server')
    })
    
    it('应该断开连接', async () => {
      const { client, transport } = createTestEnv()
      
      await client.connect(transport)
      expect(client.isConnected()).toBe(true)
      
      await client.disconnect()
      expect(client.isConnected()).toBe(false)
    })
    
    it('应该处理连接失败', async () => {
      const client = createMCPClient({
        name: 'test-client',
        version: '1.0.0',
      })
      
      const failingTransport = new InMemoryTransport()
      failingTransport.registerHandler('initialize', () => {
        throw new Error('Connection refused')
      })
      
      const result = await client.connect(failingTransport)
      
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('CONNECTION_FAILED')
      }
    })
  })
  
  describe('工具操作', () => {
    it('应该列出工具', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerTool({
        name: 'echo',
        description: 'Echo input',
        schema: z.object({ text: z.string() }),
        handler: ({ text }) => text,
      })
      
      await client.connect(transport)
      
      const result = await client.listTools()
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].name).toBe('echo')
      }
    })
    
    it('应该调用工具', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerTool({
        name: 'multiply',
        description: 'Multiply two numbers',
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: ({ a, b }) => a * b,
      })
      
      await client.connect(transport)
      
      const result = await client.callTool('multiply', { a: 3, b: 4 })
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.content[0].text).toBe('12')
      }
    })
    
    it('应该处理未连接状态', async () => {
      const client = createMCPClient({
        name: 'test-client',
        version: '1.0.0',
      })
      
      const result = await client.listTools()
      
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('NOT_CONNECTED')
      }
    })
  })
  
  describe('资源操作', () => {
    it('应该列出资源', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerResource({
        uriTemplate: 'config://app',
        name: 'app-config',
        description: 'Application configuration',
        handler: () => ({
          uri: 'config://app',
          text: '{}',
        }),
      })
      
      await client.connect(transport)
      
      const result = await client.listResources()
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].name).toBe('app-config')
      }
    })
    
    it('应该读取资源', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerResource({
        uriTemplate: 'data://users',
        name: 'users',
        handler: () => ({
          uri: 'data://users',
          text: JSON.stringify([{ id: 1, name: 'Alice' }]),
          mimeType: 'application/json',
        }),
      })
      
      await client.connect(transport)
      
      const result = await client.readResource('data://users')
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.mimeType).toBe('application/json')
        expect(result.value.text).toContain('Alice')
      }
    })
  })
  
  describe('提示操作', () => {
    it('应该列出提示', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerPrompt({
        name: 'summarize',
        description: 'Summarize text',
        arguments: [
          { name: 'text', required: true },
        ],
        handler: () => [],
      })
      
      await client.connect(transport)
      
      const result = await client.listPrompts()
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].name).toBe('summarize')
      }
    })
    
    it('应该获取提示', async () => {
      const { server, client, transport } = createTestEnv()
      
      server.registerPrompt({
        name: 'translate',
        handler: (args) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Translate to ${args.language}: ${args.text}`,
            },
          },
        ],
      })
      
      await client.connect(transport)
      
      const result = await client.getPrompt('translate', {
        language: 'Chinese',
        text: 'Hello',
      })
      
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].content.text).toContain('Chinese')
        expect(result.value[0].content.text).toContain('Hello')
      }
    })
  })
})

describe('InMemoryTransport', () => {
  it('应该管理连接状态', async () => {
    const transport = new InMemoryTransport()
    
    expect(transport.isConnected()).toBe(false)
    
    await transport.connect()
    expect(transport.isConnected()).toBe(true)
    
    await transport.disconnect()
    expect(transport.isConnected()).toBe(false)
  })
  
  it('应该执行注册的处理器', async () => {
    const transport = new InMemoryTransport()
    
    transport.registerHandler('test', (params: any) => ({
      result: params.value * 2,
    }))
    
    await transport.connect()
    
    const result = await transport.send('test', { value: 5 })
    
    expect(result).toEqual({ result: 10 })
  })
  
  it('应该在未连接时抛出错误', async () => {
    const transport = new InMemoryTransport()
    
    transport.registerHandler('test', () => 'result')
    
    await expect(transport.send('test', {})).rejects.toThrow('Not connected')
  })
  
  it('应该在没有处理器时抛出错误', async () => {
    const transport = new InMemoryTransport()
    
    await transport.connect()
    
    await expect(transport.send('unknown', {})).rejects.toThrow('No handler')
  })
})
