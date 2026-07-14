/**
 * @h-ai/ai — Persona 子功能实现
 *
 * 基于 AIRelStore 持久化 AI 角色档案，并提供系统提示词组合。
 * 角色是全局共享的（不按 objectId 隔离），因此存储仅按 id 主键。
 * @module ai-persona-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { AIRelStore } from '../store/ai-store-types.js'
import type { PersonaOperations, PersonaProfile, PersonaProfileInput, PersonaProfileUpdate } from './ai-persona-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

const logger = core.logger.child({ module: 'ai', scope: 'persona' })

/**
 * 将角色档案的 traits 组合进系统提示词
 *
 * 无 traits 时直接返回 systemPrompt；有 traits 时追加一段「性格特征」清单。
 */
function composeSystemPrompt(profile: PersonaProfile): string {
  if (profile.traits.length === 0)
    return profile.systemPrompt
  const traitLines = profile.traits.map(t => `- ${t}`).join('\n')
  return `${profile.systemPrompt}\n\n性格特征：\n${traitLines}`
}

/**
 * 创建 Persona 操作接口
 *
 * @param store - 角色档案持久化存储（id 主键，全局共享）
 * @returns PersonaOperations 实例
 */
export function createPersonaOperations(store: AIRelStore<PersonaProfile>): PersonaOperations {
  return {
    async save(input: PersonaProfileInput): Promise<HaiResult<PersonaProfile>> {
      try {
        const now = Date.now()
        const existing = await store.get(input.id)
        const profile: PersonaProfile = {
          id: input.id,
          name: input.name,
          systemPrompt: input.systemPrompt,
          traits: input.traits ?? [],
          metadata: input.metadata,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        await store.save(profile.id, profile)
        logger.trace('Persona saved', { id: profile.id })
        return ok(profile)
      }
      catch (error) {
        return err(HaiAIError.PERSONA_SAVE_FAILED, aiM('ai_personaSaveFailed', { params: { error: String(error) } }), error)
      }
    },

    async get(id: string): Promise<HaiResult<PersonaProfile>> {
      const profile = await store.get(id)
      if (!profile)
        return err(HaiAIError.PERSONA_NOT_FOUND, aiM('ai_personaNotFound', { params: { id } }))
      return ok(profile)
    },

    async update(id: string, updates: PersonaProfileUpdate): Promise<HaiResult<PersonaProfile>> {
      const existing = await store.get(id)
      if (!existing)
        return err(HaiAIError.PERSONA_NOT_FOUND, aiM('ai_personaNotFound', { params: { id } }))
      try {
        const profile: PersonaProfile = {
          ...existing,
          name: updates.name ?? existing.name,
          systemPrompt: updates.systemPrompt ?? existing.systemPrompt,
          traits: updates.traits ?? existing.traits,
          metadata: updates.metadata ?? existing.metadata,
          updatedAt: Date.now(),
        }
        await store.save(profile.id, profile)
        return ok(profile)
      }
      catch (error) {
        return err(HaiAIError.PERSONA_SAVE_FAILED, aiM('ai_personaSaveFailed', { params: { error: String(error) } }), error)
      }
    },

    async remove(id: string): Promise<HaiResult<void>> {
      await store.remove(id)
      return ok(undefined)
    },

    async list(): Promise<HaiResult<PersonaProfile[]>> {
      const profiles = await store.query({ orderBy: { field: 'createdAt', direction: 'asc' } })
      return ok(profiles)
    },

    async compose(id: string): Promise<HaiResult<string>> {
      const profile = await store.get(id)
      if (!profile)
        return err(HaiAIError.PERSONA_NOT_FOUND, aiM('ai_personaNotFound', { params: { id } }))
      return ok(composeSystemPrompt(profile))
    },
  }
}
