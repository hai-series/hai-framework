/**
 * =============================================================================
 * @hai/ai - Provider: Skills
 * =============================================================================
 *
 * Skills Provider 实现
 *
 * @module ai-provider-skills
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIError,
  Skill,
  SkillContext,
  SkillQuery,
  SkillResult,
  SkillsProvider,
} from '../ai-types.js'
import { err, ok } from '@hai/core'

import { AIErrorCode } from '../ai-config.js'

/**
 * HAI Skills Provider 实现
 *
 * 提供技能的注册、查询和执行功能。
 */
class HaiSkillsProvider implements SkillsProvider {
  private skills: Map<string, Skill> = new Map()

  constructor(_config: AIConfig) {
    // 配置保留供将来使用
  }

  register<TInput, TOutput>(skill: Skill<TInput, TOutput>): void {
    this.skills.set(skill.metadata.name, skill as Skill)
  }

  unregister(name: string): void {
    this.skills.delete(name)
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  query(query: SkillQuery): Skill[] {
    const results: Skill[] = []

    for (const skill of this.skills.values()) {
      let matches = true

      // 按名称过滤
      if (query.name && !skill.metadata.name.includes(query.name)) {
        matches = false
      }

      // 按标签过滤
      if (query.tags && query.tags.length > 0) {
        const skillTags = skill.metadata.tags || []
        const hasAllTags = query.tags.every((tag: string) => skillTags.includes(tag))
        if (!hasAllTags) {
          matches = false
        }
      }

      // 按作者过滤
      if (query.author && skill.metadata.author !== query.author) {
        matches = false
      }

      if (matches) {
        results.push(skill)
      }
    }

    return results
  }

  async execute<TInput, TOutput>(
    name: string,
    input: TInput,
    context?: SkillContext,
  ): Promise<Result<SkillResult<TOutput>, AIError>> {
    try {
      const skill = this.skills.get(name)
      if (!skill) {
        return err({
          code: AIErrorCode.SKILL_NOT_FOUND,
          message: `技能 '${name}' 未找到`,
        })
      }

      const ctx: SkillContext = context || {
        requestId: crypto.randomUUID(),
      }

      const result = await skill.execute(input, ctx)
      return ok(result as SkillResult<TOutput>)
    }
    catch (error) {
      return err({
        code: AIErrorCode.SKILL_EXECUTION_ERROR,
        message: `技能 '${name}' 执行失败：${error instanceof Error ? error.message : 'Unknown error'}`,
        cause: error,
      })
    }
  }

  // =============================================================================
  // 辅助方法
  // =============================================================================

  /**
   * 列出所有技能
   */
  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * 获取技能数量
   */
  count(): number {
    return this.skills.size
  }

  /**
   * 清空所有技能
   */
  clear(): void {
    this.skills.clear()
  }
}

/**
 * 创建 HAI Skills Provider
 *
 * @param config - AI 配置
 * @returns Skills Provider 实例
 */
export function createHaiSkillsProvider(config: AIConfig): SkillsProvider {
  return new HaiSkillsProvider(config)
}

/**
 * 定义技能（便捷方法）
 *
 * @param options - 技能选项
 * @param options.name - 技能名称
 * @param options.description - 技能描述
 * @param options.version - 技能版本
 * @param options.tags - 技能标签
 * @param options.author - 技能作者
 * @param options.execute - 技能执行函数
 * @returns 技能定义
 *
 * @example
 * ```ts
 * const translateSkill = defineSkill({
 *     name: 'translate',
 *     description: '翻译文本',
 *     tags: ['nlp', 'translation'],
 *     execute: async (input, context) => {
 *         // 执行翻译逻辑
 *         return { success: true, data: { translated: '...' } }
 *     }
 * })
 *
 * ai.skills.register(translateSkill)
 * ```
 */
export function defineSkill<TInput = unknown, TOutput = unknown>(
  options: {
    name: string
    description?: string
    version?: string
    tags?: string[]
    author?: string
    execute: (input: TInput, context: SkillContext) => Promise<SkillResult<TOutput>>
  },
): Skill<TInput, TOutput> {
  return {
    metadata: {
      name: options.name,
      description: options.description,
      version: options.version,
      tags: options.tags,
      author: options.author,
    },
    execute: options.execute,
  }
}
