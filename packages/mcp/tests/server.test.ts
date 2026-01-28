/**
 * =============================================================================
 * @hai/mcp - 服务端测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMCPServer } from '../src/server.js'

describe('MCPServer', () => {
  describe('基础功能', () => {
    it('应该创建服务端实例', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      expect(server).toBeDefined()
      expect(server.getServerInfo().name).toBe('test-server')
      expect(server.getServerInfo().version).toBe('1.0.0')
    })
    
    it('应该返回服务器能力', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true },
        },
      })
      
      const caps = server.getCapabilities()
      expect(caps.tools?.listChanged).toBe(true)
      expect(caps.resources?.subscribe).toBe(true)
    })
  })
  
  describe('工具管理', () => {
    it('应该注册工具', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerTool({
        name: 'greet',
        description: 'Greet someone',
        schema: z.object({
          name: z.string(),
        }),
        handler: ({ name }) => `Hello, ${name}!`,
      })
      
      expect(server.toolCount).toBe(1)
      
      const tools = server.listTools()
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('greet')
    })
    
    it('应该调用工具', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerTool({
        name: 'add',
        description: 'Add two numbers',
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: ({ a, b }) => a + b,
      })
      
      const result = await server.callTool('add', { a: 1, b: 2 })
      
      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toBe('3')
    })
    
    it('应该处理工具调用错误', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerTool({
        name: 'error-tool',
        description: 'A tool that always errors',
        schema: z.object({}),
        handler: () => {
          throw new Error('Intentional error')
        },
      })
      
      const result = await server.callTool('error-tool', {})
      
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Intentional error')
    })
    
    it('应该验证工具输入', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerTool({
        name: 'typed-tool',
        description: 'A typed tool',
        schema: z.object({
          value: z.number().min(0).max(100),
        }),
        handler: ({ value }) => value * 2,
      })
      
      // 无效输入
      const result = await server.callTool('typed-tool', { value: 200 })
      
      expect(result.isError).toBe(true)
    })
    
    it('应该注销工具', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerTool({
        name: 'temp-tool',
        description: 'Temporary tool',
        schema: z.object({}),
        handler: () => 'result',
      })
      
      expect(server.toolCount).toBe(1)
      
      server.unregisterTool('temp-tool')
      
      expect(server.toolCount).toBe(0)
    })
    
    it('应该返回未找到工具错误', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      const result = await server.callTool('nonexistent', {})
      
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not found')
    })
  })
  
  describe('资源管理', () => {
    it('应该注册资源', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerResource({
        uriTemplate: 'file:///{path}',
        name: 'files',
        description: 'Access files',
        mimeType: 'text/plain',
        handler: (uri) => ({
          uri,
          text: 'File content',
        }),
      })
      
      expect(server.resourceCount).toBe(1)
      
      const resources = server.listResources()
      expect(resources).toHaveLength(1)
      expect(resources[0].name).toBe('files')
    })
    
    it('应该读取资源', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerResource({
        uriTemplate: 'config://settings',
        name: 'settings',
        handler: (uri) => ({
          uri,
          text: JSON.stringify({ theme: 'dark' }),
          mimeType: 'application/json',
        }),
      })
      
      const content = await server.readResource('config://settings')
      
      expect(content).not.toBeNull()
      expect(content?.text).toBe('{"theme":"dark"}')
    })
    
    it('应该处理模板 URI', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerResource({
        uriTemplate: 'user://{id}/profile',
        name: 'user-profile',
        handler: (uri) => ({
          uri,
          text: `Profile for ${uri}`,
        }),
      })
      
      const content = await server.readResource('user://123/profile')
      
      expect(content).not.toBeNull()
      expect(content?.text).toContain('123')
    })
    
    it('应该注销资源', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerResource({
        uriTemplate: 'temp://data',
        name: 'temp',
        handler: () => ({ uri: 'temp://data', text: 'data' }),
      })
      
      expect(server.resourceCount).toBe(1)
      
      server.unregisterResource('temp')
      
      expect(server.resourceCount).toBe(0)
    })
  })
  
  describe('提示管理', () => {
    it('应该注册提示', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerPrompt({
        name: 'code-review',
        description: 'Review code',
        arguments: [
          { name: 'language', required: true },
          { name: 'style', required: false },
        ],
        handler: (args) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review this ${args.language} code.`,
            },
          },
        ],
      })
      
      expect(server.promptCount).toBe(1)
      
      const prompts = server.listPrompts()
      expect(prompts).toHaveLength(1)
      expect(prompts[0].name).toBe('code-review')
      expect(prompts[0].arguments).toHaveLength(2)
    })
    
    it('应该获取提示', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerPrompt({
        name: 'greeting',
        handler: (args) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Hello, ${args.name ?? 'stranger'}!`,
            },
          },
        ],
      })
      
      const messages = await server.getPrompt('greeting', { name: 'World' })
      
      expect(messages).not.toBeNull()
      expect(messages).toHaveLength(1)
      expect(messages?.[0].content.text).toBe('Hello, World!')
    })
    
    it('应该注销提示', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      server.registerPrompt({
        name: 'temp-prompt',
        handler: () => [],
      })
      
      expect(server.promptCount).toBe(1)
      
      server.unregisterPrompt('temp-prompt')
      
      expect(server.promptCount).toBe(0)
    })
    
    it('应该返回未找到提示', async () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
      
      const messages = await server.getPrompt('nonexistent')
      
      expect(messages).toBeNull()
    })
  })
  
  describe('链式注册', () => {
    it('应该支持链式调用', () => {
      const server = createMCPServer({
        name: 'test-server',
        version: '1.0.0',
      })
        .registerTool({
          name: 'tool1',
          description: 'Tool 1',
          schema: z.object({}),
          handler: () => 'result1',
        })
        .registerTool({
          name: 'tool2',
          description: 'Tool 2',
          schema: z.object({}),
          handler: () => 'result2',
        })
        .registerResource({
          uriTemplate: 'data://resource',
          name: 'resource1',
          handler: () => ({ uri: 'data://resource', text: 'data' }),
        })
        .registerPrompt({
          name: 'prompt1',
          handler: () => [],
        })
      
      expect(server.toolCount).toBe(2)
      expect(server.resourceCount).toBe(1)
      expect(server.promptCount).toBe(1)
    })
  })
})
