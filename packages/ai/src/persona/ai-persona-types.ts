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
 * const input: PersonaProfileInput = {
 *   id: 'xiaop',
 *   name: '小P',
 *   systemPrompt: '你是一位社会学家，善于从群体行为视角分析问题。',
 *   traits: ['谨慎', '喜欢引用真实案例'],
 * }
 * ```
 */
export interface PersonaProfileInput {
  /** 角色唯一标识（业务侧稳定 ID，如 `xiaop`） */
  id: string
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
 */
export interface PersonaProfile {
  /** 角色唯一标识 */
  id: string
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
 * // 定义一个 AI 角色
 * await ai.persona.save({
 *   id: 'xiaoq',
 *   name: '小Q',
 *   systemPrompt: '你是一位经济学家。',
 *   traits: ['数据驱动', '偏好长期视角'],
 * })
 *
 * // 组合出可直接喂给 ContextManager 的系统提示词
 * const composed = await ai.persona.compose('xiaoq')
 * const manager = ai.context.createManager({
 *   systemPrompt: composed.data,
 *   // 该角色的长期记忆用 scope 关联
 *   memory: { enable: true, enableExtract: true, scope: { personaId: 'xiaoq' } },
 * })
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
  get: (id: string) => Promise<HaiResult<PersonaProfile>>

  /**
   * 更新角色档案（仅更新传入字段）
   *
   * @param id - 角色 ID
   * @param updates - 需要更新的字段
   * @returns 更新后的完整档案
   */
  update: (id: string, updates: PersonaProfileUpdate) => Promise<HaiResult<PersonaProfile>>

  /**
   * 删除角色档案
   *
   * @param id - 角色 ID
   * @returns 成功返回 ok(undefined)
   */
  remove: (id: string) => Promise<HaiResult<void>>

  /**
   * 列出所有角色档案
   *
   * @returns 角色档案列表
   */
  list: () => Promise<HaiResult<PersonaProfile[]>>

  /**
   * 组合角色的完整系统提示词
   *
   * 将 `systemPrompt` 与 `traits` 拼装为一段可直接作为 system 消息的文本，
   * 供 `ai.context.createManager({ systemPrompt })` 使用。
   *
   * @param id - 角色 ID
   * @returns 组合后的系统提示词，角色不存在时返回 PERSONA_NOT_FOUND
   */
  compose: (id: string) => Promise<HaiResult<string>>
}
