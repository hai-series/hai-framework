/**
 * =============================================================================
 * @hai/skills - 技能注册表测试
 * =============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { defineSkill } from '../src/skill.js'
import { createSkillRegistry, SkillRegistry } from '../src/registry.js'
import type { ToolCall } from '@hai/ai'

describe('SkillRegistry', () => {
  let registry: SkillRegistry
  
  const echoSkill = defineSkill({
    name: 'echo',
    description: 'Echo input',
    category: 'utility',
    tags: ['basic', 'text'],
    schema: z.object({
      message: z.string(),
    }),
    handler: ({ message }) => message,
  })
  
  const addSkill = defineSkill({
    name: 'add',
    description: 'Add numbers',
    category: 'math',
    tags: ['basic', 'math'],
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    handler: ({ a, b }) => a + b,
  })
  
  const adminSkill = defineSkill({
    name: 'admin_action',
    description: 'Admin only action',
    category: 'admin',
    permissions: ['admin'],
    schema: z.object({}),
    handler: () => 'admin action done',
  })
  
  beforeEach(() => {
    registry = createSkillRegistry()
  })
  
  describe('register', () => {
    it('应该注册技能', () => {
      registry.register(echoSkill)
      
      expect(registry.has('echo')).toBe(true)
      expect(registry.size).toBe(1)
    })
    
    it('应该支持链式注册', () => {
      registry
        .register(echoSkill)
        .register(addSkill)
      
      expect(registry.size).toBe(2)
    })
  })
  
  describe('registerMany', () => {
    it('应该批量注册技能', () => {
      registry.registerMany([echoSkill, addSkill])
      
      expect(registry.size).toBe(2)
    })
  })
  
  describe('unregister', () => {
    it('应该注销技能', () => {
      registry.register(echoSkill)
      const deleted = registry.unregister('echo')
      
      expect(deleted).toBe(true)
      expect(registry.has('echo')).toBe(false)
    })
    
    it('应该返回 false 如果技能不存在', () => {
      const deleted = registry.unregister('nonexistent')
      
      expect(deleted).toBe(false)
    })
  })
  
  describe('get', () => {
    it('应该获取技能', () => {
      registry.register(echoSkill)
      
      const skill = registry.get('echo')
      
      expect(skill).toBeDefined()
      expect(skill?.name).toBe('echo')
    })
    
    it('应该返回 undefined 如果技能不存在', () => {
      const skill = registry.get('nonexistent')
      
      expect(skill).toBeUndefined()
    })
  })
  
  describe('query', () => {
    beforeEach(() => {
      registry.registerMany([echoSkill, addSkill, adminSkill])
    })
    
    it('应该返回所有技能', () => {
      const skills = registry.query()
      
      expect(skills.length).toBe(3)
    })
    
    it('应该按分类筛选', () => {
      const skills = registry.query({ category: 'math' })
      
      expect(skills.length).toBe(1)
      expect(skills[0].name).toBe('add')
    })
    
    it('应该按标签筛选', () => {
      const skills = registry.query({ tags: ['math'] })
      
      expect(skills.length).toBe(1)
      expect(skills[0].name).toBe('add')
    })
    
    it('应该按多个标签筛选（OR）', () => {
      const skills = registry.query({ tags: ['text', 'math'] })
      
      expect(skills.length).toBe(2)
    })
    
    it('应该按权限筛选', () => {
      const skills = registry.query({ permissions: ['admin'] })
      
      expect(skills.length).toBe(1)
      expect(skills[0].name).toBe('admin_action')
    })
    
    it('应该按启用状态筛选', () => {
      registry.disable('echo')
      
      const skills = registry.query({ enabledOnly: true })
      
      expect(skills.length).toBe(2)
      expect(skills.find(s => s.name === 'echo')).toBeUndefined()
    })
    
    it('应该支持搜索', () => {
      const skills = registry.query({ search: 'add' })
      
      expect(skills.length).toBe(1)
      expect(skills[0].name).toBe('add')
    })
  })
  
  describe('getCategories', () => {
    it('应该返回所有分类', () => {
      registry.registerMany([echoSkill, addSkill, adminSkill])
      
      const categories = registry.getCategories()
      
      expect(categories).toContain('utility')
      expect(categories).toContain('math')
      expect(categories).toContain('admin')
    })
  })
  
  describe('getTags', () => {
    it('应该返回所有标签', () => {
      registry.registerMany([echoSkill, addSkill])
      
      const tags = registry.getTags()
      
      expect(tags).toContain('basic')
      expect(tags).toContain('text')
      expect(tags).toContain('math')
    })
  })
  
  describe('enable/disable', () => {
    it('应该启用技能', () => {
      registry.register(echoSkill)
      registry.disable('echo')
      
      expect(registry.get('echo')?.enabled).toBe(false)
      
      registry.enable('echo')
      
      expect(registry.get('echo')?.enabled).toBe(true)
    })
    
    it('应该返回 false 如果技能不存在', () => {
      expect(registry.enable('nonexistent')).toBe(false)
      expect(registry.disable('nonexistent')).toBe(false)
    })
  })
  
  describe('execute', () => {
    beforeEach(() => {
      registry.registerMany([echoSkill, addSkill])
    })
    
    it('应该执行技能', async () => {
      const result = await registry.execute('echo', { message: 'Hello' })
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.data).toBe('Hello')
      }
    })
    
    it('应该返回错误如果技能不存在', async () => {
      const result = await registry.execute('nonexistent', {})
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SKILL_NOT_FOUND')
      }
    })
  })
  
  describe('executeToolCall', () => {
    beforeEach(() => {
      registry.registerMany([echoSkill, addSkill])
    })
    
    it('应该执行工具调用', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'echo',
          arguments: '{"message": "Hello"}',
        },
      }
      
      const result = await registry.executeToolCall(toolCall)
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.role).toBe('tool')
        expect(result.value.content).toBe('Hello')
        expect(result.value.tool_call_id).toBe('call_1')
      }
    })
    
    it('应该处理无效 JSON', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'echo',
          arguments: 'invalid json',
        },
      }
      
      const result = await registry.executeToolCall(toolCall)
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_FAILED')
      }
    })
  })
  
  describe('executeToolCalls', () => {
    beforeEach(() => {
      registry.registerMany([echoSkill, addSkill])
    })
    
    it('应该批量执行工具调用', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'echo', arguments: '{"message": "Hello"}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'add', arguments: '{"a": 1, "b": 2}' },
        },
      ]
      
      const result = await registry.executeToolCalls(toolCalls)
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.length).toBe(2)
        expect(result.value[0].content).toBe('Hello')
        expect(result.value[1].content).toBe('3')
      }
    })
  })
  
  describe('getToolDefinitions', () => {
    it('应该返回所有工具定义', () => {
      registry.registerMany([echoSkill, addSkill])
      
      const definitions = registry.getToolDefinitions()
      
      expect(definitions.length).toBe(2)
      expect(definitions.map(d => d.function.name)).toContain('echo')
      expect(definitions.map(d => d.function.name)).toContain('add')
    })
    
    it('应该按查询条件筛选', () => {
      registry.registerMany([echoSkill, addSkill])
      registry.disable('echo')
      
      const definitions = registry.getToolDefinitions({ enabledOnly: true })
      
      expect(definitions.length).toBe(1)
      expect(definitions[0].function.name).toBe('add')
    })
  })
  
  describe('事件', () => {
    it('应该触发注册事件', () => {
      const listener = vi.fn()
      registry.on('skill:registered', listener)
      
      registry.register(echoSkill)
      
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill:registered',
          skillName: 'echo',
        }),
      )
    })
    
    it('应该触发注销事件', () => {
      const listener = vi.fn()
      registry.register(echoSkill)
      registry.on('skill:unregistered', listener)
      
      registry.unregister('echo')
      
      expect(listener).toHaveBeenCalledTimes(1)
    })
    
    it('应该触发执行事件', async () => {
      const listener = vi.fn()
      registry.register(echoSkill)
      registry.on('skill:executed', listener)
      
      await registry.execute('echo', { message: 'test' })
      
      expect(listener).toHaveBeenCalledTimes(1)
    })
    
    it('应该移除监听器', () => {
      const listener = vi.fn()
      registry.on('skill:registered', listener)
      registry.off('skill:registered', listener)
      
      registry.register(echoSkill)
      
      expect(listener).not.toHaveBeenCalled()
    })
  })
  
  describe('clear', () => {
    it('应该清空所有技能', () => {
      registry.registerMany([echoSkill, addSkill])
      registry.clear()
      
      expect(registry.size).toBe(0)
    })
  })
})
