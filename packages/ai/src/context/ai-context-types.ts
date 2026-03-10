/**
 * @h-ai/ai — Context 子功能类型
 *
 * 定义上下文管理操作的类型接口。
 * Context 是全部子模块的聚合层，提供有状态的 ContextManager：
 * 多轮对话自动压缩 + 可选 LLM / Memory / RAG / Reasoning / Tools 编排。
 * @module ai-context-types
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type { CompressOptions } from '../compress/ai-compress-types.js'
import type { ChatMessage, LLMOperations, ToolRegistryOperations } from '../llm/ai-llm-types.js'
import type { MemoryInjectionOptions, MemoryOperations } from '../memory/ai-memory-types.js'
import type { RagOperations, RagOptions } from '../rag/ai-rag-types.js'
import type { ReasoningOperations, ReasoningOptions } from '../reasoning/ai-reasoning-types.js'
import type { InteractionScope, SessionInfo } from '../store/ai-store-types.js'
import type { SummaryResult } from '../summary/ai-summary-types.js'

// 从子模块 re-export，便于 context 消费者一站式引入
export type { CompressionStrategy } from '../compress/ai-compress-types.js'
export { CompressionStrategySchema } from '../compress/ai-compress-types.js'

// ─── Context 子功能可选依赖 ───

/**
 * Context 子功能可选依赖
 *
 * 传入后 ContextManager 可提供 chat/chatStream 等高层编排能力。
 * 各依赖按需传入，未传入的能力不可用。
 */
export interface ContextDeps {
  /** LLM 操作（chat/chatStream 必需） */
  llm?: LLMOperations
  /** Memory 操作（记忆注入/提取需要） */
  memory?: MemoryOperations
  /** RAG 操作（检索增强生成需要） */
  rag?: RagOperations
  /** Reasoning 操作（推理引擎需要） */
  reasoning?: ReasoningOperations
}

// ─── 有状态上下文管理器 ───

/**
 * 有状态上下文管理器配置
 *
 * 通过嵌套子对象直接引用各子模块的配置类型，避免字段重复声明。
 */
export interface ContextManagerOptions {
  /** 交互作用域（objectId + sessionId） */
  scope?: InteractionScope

  /** 系统提示词（创建时作为首条 system 消息追加） */
  systemPrompt?: string

  /** LLM 模型名覆盖 */
  model?: string

  /** 温度覆盖 */
  temperature?: number

  /**
   * 压缩配置（覆盖全局 compress 配置）
   *
   * 直接引用 CompressOptions，加上 auto 开关。
   */
  compress?: CompressOptions & {
    /** 是否自动触发压缩（默认 true） */
    auto?: boolean
  }

  /**
   * 记忆配置
   *
   * 引用 MemoryInjectionOptions 的检索控制字段，加上 enable/enableExtract 开关。
   */
  memory?: Pick<MemoryInjectionOptions, 'topK' | 'maxTokens' | 'position'> & {
    /** 是否启用记忆注入（默认 false） */
    enable?: boolean
    /** 是否启用自动记忆提取（默认 false） */
    enableExtract?: boolean
  }

  /**
   * RAG 配置
   *
   * 引用 RagOptions 中检索相关的字段。
   */
  rag?: Pick<RagOptions, 'sources' | 'topK' | 'minScore' | 'enableRerank' | 'rerankModel'> & {
    /** 是否启用 RAG 检索增强（默认 false） */
    enable?: boolean
  }

  /**
   * 推理配置
   *
   * 引用 ReasoningOptions 中策略相关的字段。
   */
  reasoning?: Pick<ReasoningOptions, 'strategy' | 'maxRounds'> & {
    /** 是否启用推理引擎替代普通 LLM（默认 false） */
    enable?: boolean
  }

  /** 工具注册表（传入后 chat/chatStream 支持 function calling） */
  tools?: ToolRegistryOperations
}

// ─── 单次 Chat 选项与结果 ───

/**
 * 单次 chat/chatStream 请求的覆盖选项
 */
export interface ContextChatOptions {
  /** LLM 模型名覆盖 */
  model?: string
  /** 温度覆盖 */
  temperature?: number
  /** 是否启用本次 LLM 调用的持久化（默认 false，Context 自行管理状态） */
  enablePersist?: boolean
}

/**
 * chat() 返回的结果
 */
export interface ContextChatResult {
  /** LLM 回复内容 */
  reply: string
  /** 使用的模型 */
  model: string
  /** Token 使用统计 */
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * chatStream() 产出的事件
 */
export type ContextStreamEvent
  = | { type: 'delta', text: string }
    | { type: 'done', reply: string, model: string, usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }

/**
 * 有状态上下文管理器接口
 *
 * 适用于多轮对话场景。追加消息并在超限时自动压缩；
 * 若传入 deps.llm 则可直接通过 chat/chatStream 进行对话编排。
 *
 * @example
 * ```ts
 * // 创建管理器并直接对话
 * const managerResult = ai.context.createManager({
 *   scope: { objectId: 'user-001', sessionId: 'sess-001' },
 *   systemPrompt: '你是一个友好的助手。',
 *   compress: { maxTokens: 8000, strategy: 'hybrid' },
 *   memory: { enable: true, enableExtract: true },
 * })
 * const manager = managerResult.data
 *
 * const result = await manager.chat('你好')
 * console.log(result.data.reply)
 *
 * for await (const event of manager.chatStream('讲个故事')) {
 *   if (event.type === 'delta') process.stdout.write(event.text)
 * }
 *
 * await manager.save()
 * ```
 */
export interface ContextManager {
  /** 当前作用域（如已配置） */
  readonly scope?: InteractionScope

  /**
   * 追加消息
   *
   * 自动在超限时触发压缩（如果启用了 compress.auto）。
   *
   * @param message - 要追加的消息
   * @returns 成功返回 ok(undefined)
   */
  addMessage: (message: ChatMessage) => Promise<Result<void, AIError>>

  /**
   * 获取当前消息列表（压缩后）
   *
   * @returns 当前消息列表
   */
  getMessages: () => Result<ChatMessage[], AIError>

  /**
   * 获取当前 token 使用量
   *
   * @returns 当前 token 数和预算
   */
  getTokenUsage: () => Result<{ current: number, budget: number }, AIError>

  /**
   * 获取历史摘要列表
   *
   * @returns 每次压缩产生的摘要
   */
  getSummaries: () => Result<SummaryResult[], AIError>

  /**
   * 持久化当前状态（需要 scope + 存储可用）
   */
  save: () => Promise<Result<void, AIError>>

  /**
   * 重置管理器（清空所有消息和摘要）
   */
  reset: () => void

  /**
   * 发送消息并获取回复（需 deps.llm 可用）
   *
   * 流程：追加用户消息 → 自动压缩 → 注入记忆(可选) → RAG(可选) → LLM/Reasoning → 追加助手消息 → 提取记忆(可选)
   *
   * @param message - 用户消息文本
   * @param options - 单次请求覆盖选项
   * @returns 对话结果
   */
  chat: (message: string, options?: ContextChatOptions) => Promise<Result<ContextChatResult, AIError>>

  /**
   * 流式发送消息并获取回复（需 deps.llm 可用）
   *
   * 产出事件序列：delta* → done
   *
   * @param message - 用户消息文本
   * @param options - 单次请求覆盖选项
   * @returns 异步可迭代的 ContextStreamEvent
   */
  chatStream: (message: string, options?: ContextChatOptions) => AsyncIterable<ContextStreamEvent>
}

// ─── Context 操作接口 ───

/**
 * Context 操作接口（通过 `ai.context` 访问）
 *
 * 提供有状态的 ContextManager，管理多轮对话的消息追加、自动压缩与对话编排。
 * 原子操作（token / summary / compress）已独立暴露在 `ai.token`、`ai.summary`、`ai.compress`。
 * 需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * // 创建管理器并对话
 * const managerResult = ai.context.createManager({
 *   scope: { objectId: 'user-001', sessionId: 'sess-001' },
 *   compress: { maxTokens: 8000 },
 *   memory: { enable: true },
 * })
 * const manager = managerResult.data
 * const result = await manager.chat('你好')
 *
 * // 从持久化恢复管理器
 * const restored = await ai.context.restoreManager(
 *   { objectId: 'user-001', sessionId: 'sess-001' },
 *   { memory: { enable: true } },
 * )
 * ```
 */
export interface ContextOperations {
  /**
   * 创建有状态上下文管理器
   *
   * @param options - 管理器配置
   * @returns 管理器实例
   */
  createManager: (options?: ContextManagerOptions) => Result<ContextManager, AIError>

  /**
   * 从持久化恢复上下文管理器
   *
   * @param scope - 交互作用域
   * @param options - 管理器配置覆盖
   * @returns 恢复的管理器实例
   */
  restoreManager: (scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>) => Promise<Result<ContextManager, AIError>>

  /**
   * 列出指定主体的所有会话
   *
   * @param objectId - 主体 ID
   * @returns 会话信息列表
   */
  listSessions: (objectId: string) => Promise<Result<SessionInfo[], AIError>>

  /**
   * 重命名会话
   *
   * @param sessionId - 会话 ID
   * @param title - 新标题
   * @returns 成功返回 ok(undefined)
   */
  renameSession: (sessionId: string, title: string) => Promise<Result<void, AIError>>

  /**
   * 删除会话（删除会话元数据和对应的上下文数据）
   *
   * @param sessionId - 会话 ID
   * @returns 成功返回 ok(undefined)
   */
  removeSession: (sessionId: string) => Promise<Result<void, AIError>>
}
