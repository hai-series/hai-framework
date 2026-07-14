/**
 * @h-ai/ai — Persona 子功能实现
 *
 * 基于 AIRelStore 持久化 AI 角色档案，并提供系统提示词组合。
 * 角色是全局共享的（不按 objectId 隔离），因此存储仅按 id 主键。
 * @module ai-persona-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { AIRelStore } from '../store/ai-store-types.js'
import type { PersonaOperations, PersonaProfile, PersonaProfileInput, PersonaProfileUpdate, PersonaScopeOptions } from './ai-persona-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

const logger = core.logger.child({ module: 'ai', scope: 'persona' })

/** 默认主体：平台内置角色（未指定 objectId 时使用） */
const DEFAULT_OBJECT_ID = 'system'

/** 构造存储键（JSON 数组序列化 [objectId, personaId]，避免朴素拼接碰撞） */
function personaKey(objectId: string, id: string): string {
  return JSON.stringify([objectId, id])
}

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
 * @param store - 角色档案持久化存储（按 [objectId, id] 复合键隔离多租户）
 * @returns PersonaOperations 实例
 */
export function createPersonaOperations(store: AIRelStore<PersonaProfile>): PersonaOperations {
  return {
    async save(input: PersonaProfileInput): Promise<HaiResult<PersonaProfile>> {
      try {
        const now = Date.now()
        const objectId = input.objectId ?? DEFAULT_OBJECT_ID
        const key = personaKey(objectId, input.id)
        const existing = await store.get(key)
        const profile: PersonaProfile = {
          id: input.id,
          objectId,
          name: input.name,
          systemPrompt: input.systemPrompt,
          traits: input.traits ?? [],
          metadata: input.metadata,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        await store.save(key, profile, { objectId })
        logger.trace('Persona saved', { id: profile.id, objectId })
        return ok(profile)
      }
      catch (error) {
        return err(HaiAIError.PERSONA_SAVE_FAILED, aiM('ai_personaSaveFailed', { params: { error: String(error) } }), error)
      }
    },

    async get(id: string, options?: PersonaScopeOptions): Promise<HaiResult<PersonaProfile>> {
      const objectId = options?.objectId ?? DEFAULT_OBJECT_ID
      const profile = await store.get(personaKey(objectId, id))
      if (!profile)
        return err(HaiAIError.PERSONA_NOT_FOUND, aiM('ai_personaNotFound', { params: { id } }))
      return ok(profile)
    },

    async update(id: string, updates: PersonaProfileUpdate, options?: PersonaScopeOptions): Promise<HaiResult<PersonaProfile>> {
      const objectId = options?.objectId ?? DEFAULT_OBJECT_ID
      const key = personaKey(objectId, id)
      const existing = await store.get(key)
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
        await store.save(key, profile, { objectId })
        return ok(profile)
      }
      catch (error) {
        return err(HaiAIError.PERSONA_SAVE_FAILED, aiM('ai_personaSaveFailed', { params: { error: String(error) } }), error)
      }
    },

    async remove(id: string, options?: PersonaScopeOptions): Promise<HaiResult<void>> {
      const objectId = options?.objectId ?? DEFAULT_OBJECT_ID
      await store.remove(personaKey(objectId, id))
      return ok(undefined)
    },

    async list(options?: PersonaScopeOptions): Promise<HaiResult<PersonaProfile[]>> {
      const objectId = options?.objectId ?? DEFAULT_OBJECT_ID
      const profiles = await store.query({ objectId, orderBy: { field: 'createdAt', direction: 'asc' } })
      return ok(profiles)
    },

    async compose(id: string, options?: PersonaScopeOptions): Promise<HaiResult<string>> {
      const objectId = options?.objectId ?? DEFAULT_OBJECT_ID
      const profile = await store.get(personaKey(objectId, id))
      if (!profile)
        return err(HaiAIError.PERSONA_NOT_FOUND, aiM('ai_personaNotFound', { params: { id } }))
      return ok(composeSystemPrompt(profile))
    },
  }
}
