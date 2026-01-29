/**
 * =============================================================================
 * @hai/ai - HAI Provider: Skills
 * =============================================================================
 * HAI 默认技能提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import type {
    AIConfig,
    AIError,
    Skill,
    SkillContext,
    SkillQuery,
    SkillResult,
    SkillsProvider,
} from '../../ai-types.js'

/**
 * HAI 技能提供者实现
 */
class HaiSkillsProvider implements SkillsProvider {
    private skills: Map<string, Skill> = new Map()

    constructor(_config: AIConfig) {
        // Config reserved for future use
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

            if (query.name && !skill.metadata.name.includes(query.name)) {
                matches = false
            }

            if (query.tags && query.tags.length > 0) {
                const skillTags = skill.metadata.tags || []
                const hasAllTags = query.tags.every((tag: string) => skillTags.includes(tag))
                if (!hasAllTags) {
                    matches = false
                }
            }

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
                    type: 'SKILL_NOT_FOUND',
                    message: `Skill '${name}' not found`,
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
                type: 'SKILL_EXECUTION_ERROR',
                message: `Skill '${name}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cause: error,
            })
        }
    }

    list(): Skill[] {
        return Array.from(this.skills.values())
    }

    count(): number {
        return this.skills.size
    }

    clear(): void {
        this.skills.clear()
    }
}

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

export function createHaiSkillsProvider(config: AIConfig): SkillsProvider {
    return new HaiSkillsProvider(config)
}
