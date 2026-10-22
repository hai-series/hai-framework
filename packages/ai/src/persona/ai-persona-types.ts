/**
 * @h-ai/ai — Persona 子功能类型
 *
 * 定义「AI 角色人格」的持久化与组合接口。Persona 解决的是「AI 是谁」的问题：
 * 多智能体场景（如多位专家同台访谈）中，每个 AI 有稳定的系统提示词、性格特征与
 * 长期人格。它与 Memory 正交——Memory 用 `objectId` / `scope` 回答「谁的记忆」，
 * Persona 回答「这个 AI 的身份与人设」，二者通过 `scope: { personaId }` 关联。
 * @module ai-persona-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── Persona 档案 ───

/**
 * Persona 档案输入（创建 / 覆盖保存时使用）
 *
 * @example
 * ```ts
 * import type { PersonaProfileInput } from '@h-ai/ai'
 *
 * const value: PersonaProfileInput = { id: 'support', objectId: 'tenant-1', name: '客服助手', systemPrompt: '根据已验证的订单信息回答。', traits: ['简洁', '先核对证据'] }
 * ```
 */
export interface PersonaProfileInput {
  /** 角色唯一标识（业务侧稳定 ID，如 `xiaop`） */
  id: string
  /**
   * 所属主体 ID（多租户隔离）
   *
   * 不同主体可创建同名角色而互不覆盖；不传时归为平台内置角色 `system`。
   */
  objectId?: string
  /** 角色显示名（如「小P」） */
  name?: string
  /** 角色系统提示词（定义身份、职责、语气） */
  systemPrompt: string
  /** 性格 / 风格特征（组合进系统提示词，如「谨慎」「喜欢引用案例」） */
  traits?: string[]
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 完整的 Persona 档案
 *
 * @example
 * ```ts
 * import type { PersonaProfile } from '@h-ai/ai'
 *
 * function label(profile: PersonaProfile): string {
 *   return `${profile.objectId}/${profile.id}: ${profile.name ?? profile.id}`
 * }
 * ```
 */
export interface PersonaProfile {
  /** 角色唯一标识 */
  id: string
  /** 所属主体 ID（多租户隔离；平台内置角色为 `system`） */
  objectId: string
  /** 角色显示名 */
  name?: string
  /** 角色系统提示词 */
  systemPrompt: string
  /** 性格 / 风格特征 */
  traits: string[]
  /** 附加元数据 */
  metadata?: Record<string, unknown>
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 更新时间（Unix 毫秒） */
  updatedAt: number
}

/**
 * Persona 档案更新输入
 *
 * 所有字段可选，仅更新传入的字段。
 *
 * @example
 * ```ts
 * import type { PersonaProfileUpdate } from '@h-ai/ai'
 *
 * const value: PersonaProfileUpdate = { traits: ['简洁', '引用来源'] }
 * ```
 */
export interface PersonaProfileUpdate {
  /** 更新显示名 */
  name?: string
  /** 更新系统提示词 */
  systemPrompt?: string
  /** 更新特征列表（整体替换） */
  traits?: string[]
  /** 更新元数据 */
  metadata?: Record<string, unknown>
}

// ─── Persona 操作接口 ───

/**
 * Persona 操作接口（通过 `ai.persona` 访问）
 *
 * 管理 AI 角色人格的持久化与系统提示词组合。需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 应用启动已成功初始化 ai；这里是业务服务函数。
 * async function run() {
 *   const result = await ai.persona.save({ id: 'support', objectId: 'tenant-1', systemPrompt: '先核对订单状态再回答。' })
 *   if (!result.success)
 *     return result
 *   const composed = await ai.persona.compose(result.data.id, { objectId: result.data.objectId })
 *   if (!composed.success)
 *     return composed
 *   return composed.data
 * }
 * ```
 */
export interface PersonaOperations {
  /**
   * 创建或覆盖保存一个角色档案（upsert 语义）
   *
   * @param profile - 角色档案输入
   * @returns 保存后的完整档案
   */
  save: (profile: PersonaProfileInput) => Promise<HaiResult<PersonaProfile>>

  /**
   * 按 ID 获取角色档案
   *
   * @param id - 角色 ID
   * @returns 角色档案，不存在时返回 PERSONA_NOT_FOUND
   */
  get: (id: string, options?: PersonaScopeOptions) => Promise<HaiResult<PersonaProfile>>

  /**
   * 更新角色档案（仅更新传入字段）
   *
   * @param id - 角色 ID
   * @param updates - 需要更新的字段
   * @param options - 主体作用域（默认 `system`）
   * @returns 更新后的完整档案
   */
  update: (id: string, updates: PersonaProfileUpdate, options?: PersonaScopeOptions) => Promise<HaiResult<PersonaProfile>>

  /**
   * 删除角色档案
   *
   * @param id - 角色 ID
   * @param options - 主体作用域（默认 `system`）
   * @returns 成功返回 ok(undefined)
   */
  remove: (id: string, options?: PersonaScopeOptions) => Promise<HaiResult<void>>

  /**
   * 列出指定主体的角色档案
   *
   * @param options - 主体作用域（默认 `system`）
   * @returns 角色档案列表
   */
  list: (options?: PersonaScopeOptions) => Promise<HaiResult<PersonaProfile[]>>

  /**
   * 组合角色的完整系统提示词
   *
   * 将 `systemPrompt` 与 `traits` 拼装为一段可直接作为 system 消息的文本，
   * 供 `ai.context.createManager({ scope, systemPrompt })` 使用。
   *
   * @param id - 角色 ID
   * @param options - 主体作用域（默认 `system`）
   * @returns 组合后的系统提示词，角色不存在时返回 PERSONA_NOT_FOUND
   */
  compose: (id: string, options?: PersonaScopeOptions) => Promise<HaiResult<string>>
}

/**
 * Persona 操作的主体作用域选项
 *
 * @example
 * ```ts
 * import type { PersonaScopeOptions } from '@h-ai/ai'
 *
 * const value: PersonaScopeOptions = { objectId: 'tenant-1' }
 * ```
 */
export interface PersonaScopeOptions {
  /** 所属主体 ID（不传时归为平台内置角色 `system`） */
  objectId?: string
}
