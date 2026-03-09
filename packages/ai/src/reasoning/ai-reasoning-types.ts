/**
 * @h-ai/ai — Reasoning 子功能类型
 *
 * 定义推理策略和推理操作的类型接口。
 * 支持 ReAct、Chain-of-Thought（CoT）、Plan-and-Execute 三种策略。
 * @module ai-reasoning-types
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { ChatMessage, ToolRegistryOperations } from '../llm/ai-llm-types.js'

// ─── 推理策略 ───

/**
 * 推理策略类型
 *
 * - `react` — ReAct（Reasoning + Acting）：交替 思考→行动→观察 循环
 * - `cot` — Chain-of-Thought：将问题分解为思维链逐步推理
 * - `plan-execute` — Plan-and-Execute：先生成计划再逐步执行
 */
export type ReasoningStrategy = 'react' | 'cot' | 'plan-execute'

// ─── 推理选项 ───

/**
 * 推理执行选项
 */
export interface ReasoningOptions {
  /** 交互主体 ID */
  objectId?: string
  /** 会话 ID */
  sessionId?: string
  /** 推理策略（默认 `'react'`） */
  strategy?: ReasoningStrategy
  /** 最大推理轮次（默认 10） */
  maxRounds?: number
  /** 使用的模型 ID 或名称（可选，默认使用 reasoning 场景的模型） */
  model?: string
  /** Plan-Execute 规划阶段模型（可选，默认回退到 `model` → 场景 `plan` → 场景 `reasoning`） */
  planModel?: string
  /** Plan-Execute 执行阶段模型（可选，默认回退到 `model` → 场景 `execute` → 场景 `reasoning`） */
  executeModel?: string
  /** 系统提示词（可选，覆盖默认的策略提示词） */
  systemPrompt?: string
  /**
   * 前置对话上下文（可选）
   *
   * 插入到系统提示词之后、当前问题之前，用于注入：
   * - 历史对话轮次（连续对话场景）
   * - `ai.memory.injectMemories()` 处理后的记忆增强消息
   * - RAG 检索到的内容片段（构造为 system 消息）
   *
   * @example
   * ```ts
   * // 将记忆注入推理上下文
   * const withMemory = await ai.memory.injectMemories(
   *   [{ role: 'user', content: query }],
   *   { objectId: 'user-001' },
   * )
   * await ai.reasoning.run(query, { messages: withMemory.data })
   * ```
   */
  messages?: ChatMessage[]
  /** 可用工具注册表（可选，ReAct 和 Plan-Execute 策略可用） */
  tools?: ToolRegistryOperations
  /** 温度覆盖 */
  temperature?: number
}

// ─── 推理步骤 ───

/**
 * 推理步骤类型
 */
export type ReasoningStepType = 'thought' | 'action' | 'observation' | 'plan' | 'answer'

/**
 * 单个推理步骤
 */
export interface ReasoningStep {
  /** 步骤类型 */
  type: ReasoningStepType
  /** 步骤内容 */
  content: string
  /** 工具调用信息（仅 action 类型） */
  toolCall?: {
    name: string
    arguments: Record<string, unknown>
    result?: string
  }
  /** 步骤索引（从 0 开始） */
  index: number
}

// ─── 推理结果 ───

/**
 * 推理执行结果
 */
export interface ReasoningResult {
  /** 最终答案 */
  answer: string
  /** 推理步骤列表 */
  steps: ReasoningStep[]
  /** 使用的策略 */
  strategy: ReasoningStrategy
  /** 总推理轮次 */
  rounds: number
  /** 完整的消息历史 */
  messages: ChatMessage[]
}

// ─── 推理操作接口 ───

/**
 * 推理操作接口（通过 `ai.reasoning` 访问）
 *
 * 需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * // ReAct 推理（带工具）
 * const result = await ai.reasoning.run(
 *   '分析这份数据...',
 *   {
 *     strategy: 'react',
 *     tools: registry,
 *     maxRounds: 5,
 *   },
 * )
 *
 * // CoT 推理
 * const result = await ai.reasoning.run(
 *   '解释量子纠缠',
 *   { strategy: 'cot' },
 * )
 * ```
 */
export interface ReasoningOperations {
  /**
   * 执行推理
   *
   * @param query - 用户问题或任务描述
   * @param options - 推理选项
   * @returns 推理结果
   */
  run: (query: string, options?: ReasoningOptions) => Promise<Result<ReasoningResult, AIError>>
}
