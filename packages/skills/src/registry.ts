/**
 * =============================================================================
 * @hai/skills - 技能注册表
 * =============================================================================
 * 管理技能的注册、查询和执行
 * 
 * 特性:
 * - 技能注册和注销
 * - 分类和标签查询
 * - 批量执行
 * - 事件通知
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type { ToolDefinition, ToolCall, ToolMessage } from '@hai/ai'
import type { Skill, SkillContext, SkillError, SkillResult, SkillMetadata } from './skill.js'

const logger = createLogger({ name: 'skill-registry' })

/**
 * 技能查询条件
 */
export interface SkillQuery {
  /** 按分类筛选 */
  category?: string
  /** 按标签筛选（包含任一） */
  tags?: string[]
  /** 按权限筛选 */
  permissions?: string[]
  /** 仅启用的技能 */
  enabledOnly?: boolean
  /** 搜索关键词 */
  search?: string
}

/**
 * 注册表事件类型
 */
export type RegistryEventType =
  | 'skill:registered'
  | 'skill:unregistered'
  | 'skill:enabled'
  | 'skill:disabled'
  | 'skill:executed'
  | 'skill:error'

/**
 * 注册表事件
 */
export interface RegistryEvent {
  type: RegistryEventType
  skillName: string
  timestamp: Date
  data?: unknown
}

/**
 * 事件监听器
 */
export type RegistryEventListener = (event: RegistryEvent) => void

/**
 * 技能注册表
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map()
  private listeners: Map<RegistryEventType, Set<RegistryEventListener>> = new Map()
  
  /**
   * 注册技能
   * 
   * @param skill - 技能实例
   */
  register<TInput, TOutput>(skill: Skill<TInput, TOutput>): this {
    if (this.skills.has(skill.name)) {
      logger.warn({ skillName: skill.name }, 'Overwriting existing skill')
    }
    
    this.skills.set(skill.name, skill as Skill)
    logger.info(
      { skillName: skill.name, category: skill.category },
      'Skill registered',
    )
    
    this.emit({
      type: 'skill:registered',
      skillName: skill.name,
      timestamp: new Date(),
      data: skill.getMetadata(),
    })
    
    return this
  }
  
  /**
   * 批量注册技能
   * 
   * @param skills - 技能数组
   */
  registerMany(skills: Skill[]): this {
    for (const skill of skills) {
      this.register(skill)
    }
    return this
  }
  
  /**
   * 注销技能
   * 
   * @param name - 技能名称
   */
  unregister(name: string): boolean {
    const deleted = this.skills.delete(name)
    
    if (deleted) {
      logger.info({ skillName: name }, 'Skill unregistered')
      
      this.emit({
        type: 'skill:unregistered',
        skillName: name,
        timestamp: new Date(),
      })
    }
    
    return deleted
  }
  
  /**
   * 获取技能
   * 
   * @param name - 技能名称
   */
  get<TInput = unknown, TOutput = unknown>(
    name: string,
  ): Skill<TInput, TOutput> | undefined {
    return this.skills.get(name) as Skill<TInput, TOutput> | undefined
  }
  
  /**
   * 检查技能是否存在
   * 
   * @param name - 技能名称
   */
  has(name: string): boolean {
    return this.skills.has(name)
  }
  
  /**
   * 获取所有技能名称
   */
  getNames(): string[] {
    return Array.from(this.skills.keys())
  }
  
  /**
   * 获取所有技能
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values())
  }
  
  /**
   * 查询技能
   * 
   * @param query - 查询条件
   */
  query(query: SkillQuery = {}): Skill[] {
    const {
      category,
      tags,
      permissions,
      enabledOnly = false,
      search,
    } = query
    
    let results = this.getAll()
    
    // 按启用状态筛选
    if (enabledOnly) {
      results = results.filter(skill => skill.enabled)
    }
    
    // 按分类筛选
    if (category) {
      results = results.filter(skill => skill.category === category)
    }
    
    // 按标签筛选
    if (tags && tags.length > 0) {
      results = results.filter(skill =>
        tags.some(tag => skill.tags.includes(tag)),
      )
    }
    
    // 按权限筛选
    if (permissions && permissions.length > 0) {
      results = results.filter(skill =>
        permissions.some(perm => skill.permissions.includes(perm)),
      )
    }
    
    // 搜索
    if (search) {
      const searchLower = search.toLowerCase()
      results = results.filter(
        skill =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.displayName.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower),
      )
    }
    
    return results
  }
  
  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    
    for (const skill of this.skills.values()) {
      if (skill.category) {
        categories.add(skill.category)
      }
    }
    
    return Array.from(categories)
  }
  
  /**
   * 获取所有标签
   */
  getTags(): string[] {
    const tags = new Set<string>()
    
    for (const skill of this.skills.values()) {
      for (const tag of skill.tags) {
        tags.add(tag)
      }
    }
    
    return Array.from(tags)
  }
  
  /**
   * 启用技能
   * 
   * @param name - 技能名称
   */
  enable(name: string): boolean {
    const skill = this.skills.get(name)
    
    if (!skill) {
      return false
    }
    
    skill.enabled = true
    
    this.emit({
      type: 'skill:enabled',
      skillName: name,
      timestamp: new Date(),
    })
    
    return true
  }
  
  /**
   * 禁用技能
   * 
   * @param name - 技能名称
   */
  disable(name: string): boolean {
    const skill = this.skills.get(name)
    
    if (!skill) {
      return false
    }
    
    skill.enabled = false
    
    this.emit({
      type: 'skill:disabled',
      skillName: name,
      timestamp: new Date(),
    })
    
    return true
  }
  
  /**
   * 执行技能
   * 
   * @param name - 技能名称
   * @param input - 输入参数
   * @param context - 执行上下文
   */
  async execute<TOutput = unknown>(
    name: string,
    input: unknown,
    context?: Partial<SkillContext>,
  ): Promise<Result<SkillResult<TOutput>, SkillError>> {
    const skill = this.skills.get(name)
    
    if (!skill) {
      return err({
        type: 'SKILL_NOT_FOUND',
        message: `Skill '${name}' not found`,
        skillName: name,
      })
    }
    
    const result = await skill.execute(input, context)
    
    if (result.ok) {
      this.emit({
        type: 'skill:executed',
        skillName: name,
        timestamp: new Date(),
        data: { duration: result.value.duration },
      })
    }
    else {
      this.emit({
        type: 'skill:error',
        skillName: name,
        timestamp: new Date(),
        data: { error: result.error },
      })
    }
    
    return result as Result<SkillResult<TOutput>, SkillError>
  }
  
  /**
   * 执行 AI 工具调用
   * 
   * @param toolCall - 工具调用
   * @param context - 执行上下文
   */
  async executeToolCall(
    toolCall: ToolCall,
    context?: Partial<SkillContext>,
  ): Promise<Result<ToolMessage, SkillError>> {
    // 解析参数
    let args: unknown
    try {
      args = JSON.parse(toolCall.function.arguments)
    }
    catch {
      return err({
        type: 'VALIDATION_FAILED',
        message: 'Invalid JSON in tool call arguments',
        skillName: toolCall.function.name,
      })
    }
    
    // 执行技能
    const result = await this.execute(toolCall.function.name, args, context)
    
    if (!result.ok) {
      return result as Result<ToolMessage, SkillError>
    }
    
    // 构建工具消息
    const content = typeof result.value.data === 'string'
      ? result.value.data
      : JSON.stringify(result.value.data)
    
    return ok({
      role: 'tool',
      content,
      tool_call_id: toolCall.id,
    })
  }
  
  /**
   * 批量执行工具调用
   * 
   * @param toolCalls - 工具调用数组
   * @param context - 执行上下文
   * @param options - 执行选项
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context?: Partial<SkillContext>,
    options: { parallel?: boolean } = {},
  ): Promise<Result<ToolMessage[], SkillError>> {
    const { parallel = true } = options
    const messages: ToolMessage[] = []
    
    if (parallel) {
      const results = await Promise.all(
        toolCalls.map(tc => this.executeToolCall(tc, context)),
      )
      
      for (const result of results) {
        if (!result.ok) {
          return result as Result<ToolMessage[], SkillError>
        }
        messages.push(result.value)
      }
    }
    else {
      for (const toolCall of toolCalls) {
        const result = await this.executeToolCall(toolCall, context)
        if (!result.ok) {
          return result as Result<ToolMessage[], SkillError>
        }
        messages.push(result.value)
      }
    }
    
    return ok(messages)
  }
  
  /**
   * 获取所有技能的 AI 工具定义
   * 
   * @param query - 可选的查询条件
   */
  getToolDefinitions(query?: SkillQuery): ToolDefinition[] {
    const skills = query ? this.query(query) : this.query({ enabledOnly: true })
    return skills.map(skill => skill.toToolDefinition())
  }
  
  /**
   * 获取所有技能元数据
   * 
   * @param query - 可选的查询条件
   */
  getMetadata(query?: SkillQuery): SkillMetadata[] {
    const skills = query ? this.query(query) : this.getAll()
    return skills.map(skill => skill.getMetadata())
  }
  
  /**
   * 添加事件监听器
   * 
   * @param type - 事件类型
   * @param listener - 监听器
   */
  on(type: RegistryEventType, listener: RegistryEventListener): this {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
    return this
  }
  
  /**
   * 移除事件监听器
   * 
   * @param type - 事件类型
   * @param listener - 监听器
   */
  off(type: RegistryEventType, listener: RegistryEventListener): this {
    this.listeners.get(type)?.delete(listener)
    return this
  }
  
  /**
   * 发送事件
   */
  private emit(event: RegistryEvent): void {
    const listeners = this.listeners.get(event.type)
    
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        }
        catch (error) {
          logger.error({ error, eventType: event.type }, 'Event listener error')
        }
      }
    }
  }
  
  /**
   * 清空所有技能
   */
  clear(): void {
    this.skills.clear()
    logger.info('All skills cleared')
  }
  
  /**
   * 获取技能数量
   */
  get size(): number {
    return this.skills.size
  }
}

/**
 * 创建技能注册表
 */
export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry()
}
