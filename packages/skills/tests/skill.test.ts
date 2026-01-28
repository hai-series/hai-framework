/**
 * =============================================================================
 * @hai/skills - 技能定义测试
 * =============================================================================
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { defineSkill } from '../src/skill.js'

describe('defineSkill', () => {
  it('应该创建技能实例', () => {
    const skill = defineSkill({
      name: 'test_skill',
      description: 'A test skill',
      schema: z.object({
        input: z.string(),
      }),
      handler: ({ input }) => `Processed: ${input}`,
    })
    
    expect(skill.name).toBe('test_skill')
    expect(skill.description).toBe('A test skill')
    expect(skill.enabled).toBe(true)
  })
  
  it('应该支持显示名称和分类', () => {
    const skill = defineSkill({
      name: 'search_docs',
      displayName: '文档搜索',
      description: 'Search documents',
      category: 'search',
      tags: ['search', 'documents'],
      schema: z.object({}),
      handler: () => [],
    })
    
    expect(skill.displayName).toBe('文档搜索')
    expect(skill.category).toBe('search')
    expect(skill.tags).toContain('search')
  })
  
  describe('execute', () => {
    it('应该执行技能并返回结果', async () => {
      const skill = defineSkill({
        name: 'echo',
        description: 'Echo input',
        schema: z.object({
          message: z.string(),
        }),
        handler: ({ message }) => message,
      })
      
      const result = await skill.execute({ message: 'Hello' })
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.data).toBe('Hello')
        expect(result.value.duration).toBeGreaterThanOrEqual(0)
      }
    })
    
    it('应该验证输入参数', async () => {
      const skill = defineSkill({
        name: 'add',
        description: 'Add two numbers',
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: ({ a, b }) => a + b,
      })
      
      const result = await skill.execute({ a: 'not a number', b: 2 } as any)
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_FAILED')
      }
    })
    
    it('应该处理异步处理器', async () => {
      const skill = defineSkill({
        name: 'async_skill',
        description: 'Async skill',
        schema: z.object({}),
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return 'done'
        },
      })
      
      const result = await skill.execute({})
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.data).toBe('done')
      }
    })
    
    it('应该捕获执行错误', async () => {
      const skill = defineSkill({
        name: 'error_skill',
        description: 'Skill that throws',
        schema: z.object({}),
        handler: () => {
          throw new Error('Test error')
        },
      })
      
      const result = await skill.execute({})
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('EXECUTION_FAILED')
        expect(result.error.message).toContain('Test error')
      }
    })
    
    it('应该在禁用时拒绝执行', async () => {
      const skill = defineSkill({
        name: 'disabled_skill',
        description: 'Disabled skill',
        enabled: false,
        schema: z.object({}),
        handler: () => 'should not run',
      })
      
      const result = await skill.execute({})
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('DISABLED')
      }
    })
    
    it('应该支持超时', async () => {
      const skill = defineSkill({
        name: 'slow_skill',
        description: 'Slow skill',
        timeout: 50,
        schema: z.object({}),
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 200))
          return 'done'
        },
      })
      
      const result = await skill.execute({})
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT')
      }
    })
  })
  
  describe('权限检查', () => {
    it('应该在无权限要求时允许执行', async () => {
      const skill = defineSkill({
        name: 'public_skill',
        description: 'Public skill',
        permissions: [],
        schema: z.object({}),
        handler: () => 'ok',
      })
      
      const result = await skill.execute({}, { roles: [] })
      
      expect(result.ok).toBe(true)
    })
    
    it('应该在有权限时允许执行', async () => {
      const skill = defineSkill({
        name: 'admin_skill',
        description: 'Admin skill',
        permissions: ['admin'],
        schema: z.object({}),
        handler: () => 'ok',
      })
      
      const result = await skill.execute({}, { roles: ['admin', 'user'] })
      
      expect(result.ok).toBe(true)
    })
    
    it('应该在无权限时拒绝执行', async () => {
      const skill = defineSkill({
        name: 'admin_skill',
        description: 'Admin skill',
        permissions: ['admin'],
        schema: z.object({}),
        handler: () => 'ok',
      })
      
      const result = await skill.execute({}, { roles: ['user'] })
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PERMISSION_DENIED')
      }
    })
  })
  
  describe('生命周期钩子', () => {
    it('应该调用 beforeExecute', async () => {
      let beforeCalled = false
      
      const skill = defineSkill({
        name: 'hook_skill',
        description: 'Skill with hooks',
        schema: z.object({}),
        handler: () => 'ok',
        beforeExecute: () => {
          beforeCalled = true
        },
      })
      
      await skill.execute({})
      
      expect(beforeCalled).toBe(true)
    })
    
    it('应该调用 afterExecute', async () => {
      let afterOutput: unknown = null
      
      const skill = defineSkill({
        name: 'hook_skill',
        description: 'Skill with hooks',
        schema: z.object({}),
        handler: () => 'result',
        afterExecute: (_, output) => {
          afterOutput = output
        },
      })
      
      await skill.execute({})
      
      expect(afterOutput).toBe('result')
    })
    
    it('应该调用 onError', async () => {
      let errorCaught: Error | null = null
      
      const skill = defineSkill({
        name: 'error_hook_skill',
        description: 'Skill with error hook',
        schema: z.object({}),
        handler: () => {
          throw new Error('Test error')
        },
        onError: (error) => {
          errorCaught = error
        },
      })
      
      await skill.execute({})
      
      expect(errorCaught).not.toBeNull()
      expect(errorCaught?.message).toBe('Test error')
    })
  })
  
  describe('toToolDefinition', () => {
    it('应该生成 AI 工具定义', () => {
      const skill = defineSkill({
        name: 'search',
        description: 'Search for items',
        schema: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
        handler: () => [],
      })
      
      const definition = skill.toToolDefinition()
      
      expect(definition.type).toBe('function')
      expect(definition.function.name).toBe('search')
      expect(definition.function.description).toBe('Search for items')
      expect(definition.function.parameters).toEqual({
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      })
    })
  })
  
  describe('getMetadata', () => {
    it('应该返回技能元数据', () => {
      const skill = defineSkill({
        name: 'meta_skill',
        displayName: '元数据技能',
        description: 'Skill with metadata',
        category: 'test',
        tags: ['tag1', 'tag2'],
        permissions: ['read'],
        timeout: 5000,
        rateLimit: 10,
        schema: z.object({
          input: z.string(),
        }),
        handler: () => 'ok',
      })
      
      const metadata = skill.getMetadata()
      
      expect(metadata.name).toBe('meta_skill')
      expect(metadata.displayName).toBe('元数据技能')
      expect(metadata.description).toBe('Skill with metadata')
      expect(metadata.category).toBe('test')
      expect(metadata.tags).toEqual(['tag1', 'tag2'])
      expect(metadata.permissions).toEqual(['read'])
      expect(metadata.timeout).toBe(5000)
      expect(metadata.rateLimit).toBe(10)
      expect(metadata.schema).toBeDefined()
    })
  })
  
  describe('enabled 属性', () => {
    it('应该可以动态启用/禁用', async () => {
      const skill = defineSkill({
        name: 'toggleable',
        description: 'Toggleable skill',
        schema: z.object({}),
        handler: () => 'ok',
      })
      
      expect(skill.enabled).toBe(true)
      
      skill.enabled = false
      expect(skill.enabled).toBe(false)
      
      const result = await skill.execute({})
      expect(result.ok).toBe(false)
      
      skill.enabled = true
      const result2 = await skill.execute({})
      expect(result2.ok).toBe(true)
    })
  })
})
