/**
 * @h-ai/ai — Context 子功能类型
 *
 * 定义上下文管理操作的类型接口。
 * Context 是全部子模块的聚合层，提供有状态的 ContextManager：
 * 多轮对话自动压缩 + 可选 LLM / Memory / RAG / Reasoning / Tools 编排。
 * @module ai-context-types
 */

import type { HaiResult } from '@h-ai/core'

import type { CompressOptions } from '../compress/ai-compress-types.js'
import type { ChatMessage, LLMOperations, ToolRegistryOperations } from '../llm/ai-llm-types.js'
import type { MemoryEntry, MemoryOperations, MemoryType } from '../memory/ai-memory-types.js'
import type { RagOperations, RagOptions } from '../rag/ai-rag-types.js'
import type { ReasoningOperations, ReasoningOptions } from '../reasoning/ai-reasoning-types.js'
import type { InteractionScope, SessionInfo } from '../store/ai-store-types.js'
import type { SummaryOperations, SummaryResult } from '../summary/ai-summary-types.js'

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
  /** Summary 操作（会话固化 consolidate 需要） */
  summary?: SummaryOperations
}

// ─── Memory 生命周期（会话固化） ───

/**
 * 会话固化选项（`ContextManager.consolidate` 使用）
 *
 * 把「短期会话记忆 + 摘要」固化为「长期记忆」，形成
 * `Session Memory → Summary → Long-term Memory` 的生命周期闭环。
 */
export interface ConsolidateOptions {
  /**
   * 长期记忆作用域。
   *
   * 默认使用管理器 `memory.scope`。通常应传入**不含 sessionId** 的作用域
   * （如 `{ userId, personaId }`），使固化后的记忆跨会话持久，而非绑定单次会话。
   */
  scope?: Record<string, unknown>
  /** 固化提取的记忆类型限制 */
  types?: MemoryType[]
  /** 摘要 / 提取使用的模型 */
  model?: string
  /** 固化提取的自定义 systemPrompt */
  extractionSystemPrompt?: string
}

/**
 * 会话固化结果
 */
export interface ConsolidateResult {
  /** 本次会话的整合摘要 */
  summary: string
  /** 固化到长期记忆的条目 */
  memories: MemoryEntry[]
}

// ─── Conversation Commit Layer（真实对话状态） ───

/**
 * 对话轮次状态
 *
 * 描述一次 assistant 生成从「模型产出」到「真实进入对话」的生命周期：
 * - `generating` — 模型正在/已生成，但尚未确定实际对外表达的内容
 * - `speaking` — 已进入下游表达（如 TTS 合成 / 播放）
 * - `completed` — 已提交，完整生成文本即为真实文本
 * - `interrupted` — 被打断，仅实际表达出去的部分（committed）进入对话
 */
export type ConversationTurnStatus = 'generating' | 'speaking' | 'completed' | 'interrupted'

/**
 * 对话轮次
 *
 * 区分「模型生成的文本」与「真实进入对话的文本」，解决多智能体 / 语音访谈等场景中
 * 「AI 说到一半被打断，下一轮所有参与者应看到真实发生了什么」的问题。
 */
export interface ConversationTurn {
  /** 轮次唯一标识 */
  id: string
  /** 发言者 */
  speaker: 'user' | 'assistant'
  /** 模型生成的完整文本 */
  generated: string
  /** 实际提交进入上下文的文本（`completed` 时通常等于 generated；`interrupted` 时为真实表达部分） */
  committed: string
  /** 轮次状态 */
  status: ConversationTurnStatus
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 提交时间（Unix 毫秒，未提交时为 undefined） */
  committedAt?: number
}

/**
 * 提交 / 打断轮次的输入
 */
export interface CommitTurnInput {
  /**
   * 实际进入对话的文本。
   *
   * - `commitTurn` 不传时默认使用模型生成的完整文本（generated）。
   * - `interruptTurn` 不传时默认视为「未表达任何内容」（空串，不写入上下文）。
   */
  text?: string
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
   * 对话提交模式（默认 `auto`）
   *
   * - `auto`：`chat` / `chatStream` 生成结束后，自动把**模型生成的完整文本**写入上下文并触发记忆提取。
   * - `manual`：生成结束后**不写入**上下文，仅登记一个待提交轮次并返回 `turnId`；由调用方在确定
   *   「实际发生了什么」后，通过 `commitTurn` / `interruptTurn` 写入**真实文本**。
   *
   * 用于「模型生成 → TTS 合成 → 实际播放」链路：AI 说到一半被打断时，只有真正播放出去的
   * 部分才应进入下一轮所有参与者可见的对话状态，而不是模型本想说完的全文。
   */
  turnCommit?: 'auto' | 'manual'

  /**
   * 并发生成策略（默认 `reject`）
   *
   * ContextManager 默认实行**单活动生成**：同一管理器同一时刻只允许一个未完成的
   * `chat` / `chatStream` 轮次，避免「上一轮 AI 尚未退出，下一轮 user 消息先写入」
   * 导致的消息乱序（user1 → user2 → assistant1）。
   *
   * - `reject`：已有活动生成时，新的 `chat` / `chatStream` 立即返回 `CONTEXT_BUSY` 错误。
   * - `queue`：新请求排队，等待前一轮次进入终态（`completed` / `interrupted`）后再开始。
   *
   * `manual` 提交模式下，屏障持续到 `commitTurn` / `interruptTurn` 提交真实文本为止，
   * 因此「打断当前轮次 → 立即发起下一轮」也能保证顺序正确。
   */
  concurrency?: 'reject' | 'queue'

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
   * 控制记忆注入与提取。`scope` / `types` / `minImportance` 会完整透传给 Memory 的
   * `injectMemories` 与 `extract`，用于表达「用户 + 主题 + 角色」等多维隔离
   * （如 `{ userId, topicId, personaId }`）。
   */
  memory?: {
    /** 是否启用记忆注入（默认 false） */
    enable?: boolean
    /** 是否启用自动记忆提取（默认 false） */
    enableExtract?: boolean
    /** 业务作用域（透传给 injectMemories / extract，key-value 匹配隔离） */
    scope?: Record<string, unknown>
    /** 注入 / 提取时限定的记忆类型 */
    types?: MemoryType[]
    /** 注入时的最低重要性阈值 */
    minImportance?: number
    /** 注入的记忆数量 */
    topK?: number
    /** 注入记忆占用的最大 token 预算 */
    maxTokens?: number
    /** 注入位置：system 追加或最后一条用户消息前插入 */
    position?: 'system' | 'before-last'
    /** 记忆提取使用的模型（覆盖默认提取模型） */
    extractionModel?: string
    /** 记忆提取的自定义 systemPrompt */
    extractionSystemPrompt?: string
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

  /**
   * 工具调用最大轮次（默认 10）
   *
   * 当 LLM 返回 tool_calls 时，自动执行工具并将结果回传 LLM，
   * 重复此过程直到 LLM 给出文本回复或达到最大轮次。
   */
  maxToolRounds?: number
}

// ─── 单次 Chat 选项与结果 ───

/**
 * 重置管理器选项（`ContextManager.reset` 使用）
 */
export interface ContextResetOptions {
  /**
   * 是否保留系统提示词（默认 `true`）
   *
   * 系统提示词（Persona / System Prompt）只在创建时追加一次；重置若不保留，
   * 会连同对话历史一起清空。默认重新写入系统提示词，避免 Persona 语义丢失。
   */
  preserveSystemPrompt?: boolean
  /**
   * 是否终止活动轮次（默认 `true`）
   *
   * 为 `true` 时：中断内部生成信号，使所有非终态轮次进入 `interrupted` 终态，
   * 释放并发屏障，并阻止这些旧轮次在重置后被再次 `commitTurn` / `interruptTurn`。
   */
  cancelActiveTurn?: boolean
  /**
   * 是否等待后台记忆提取任务完成后再清空（默认 `false`）
   *
   * 为 `true` 时先 `flush()` 等待正在运行的记忆提取写入完成；否则不等待
   * （已在途的提取任务仍会自行写入记忆后端，但其结果不再影响本管理器状态）。
   */
  waitForMemoryTasks?: boolean
}

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
  /**
   * 请求取消信号
   *
   * 透传给底层 LLM 调用；打断、用户切换等场景可 `abortController.abort()`
   * 立即停止上游生成与计费。
   */
  signal?: AbortSignal
}

/**
 * chat() 返回的结果
 */
export interface ContextChatResult {
  /** LLM 回复内容 */
  reply: string
  /** 使用的模型 */
  model: string
  /**
   * 本次生成对应的对话轮次 ID
   *
   * `turnCommit: 'manual'` 时，用于后续 `commitTurn` / `interruptTurn` 提交真实文本；
   * `auto` 模式下该轮已自动提交（`completed`）。
   */
  turnId: string
  /** Token 使用统计 */
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * chatStream() 产出的事件
 *
 * 事件序列：`turn_started` → `delta`* → `done`；中途取消（AbortSignal）时为
 * `turn_started` → `delta`* → `cancelled`。`cancelled` 保留 turnId 与已生成文本，
 * 调用方可用真实内容调用 `commitTurn` / `interruptTurn` 提交。
 */
export type ContextStreamEvent
  = | { type: 'turn_started', turnId: string }
    | { type: 'delta', text: string }
    | { type: 'tool_call', name: string, arguments: string }
    | { type: 'tool_result', name: string, content: string, success: boolean }
    | { type: 'done', reply: string, model: string, turnId: string, usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }
    | { type: 'cancelled', turnId: string, generated: string }

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
 * if (result.success) {
 *   const reply = result.data.reply
 *   // 将 reply 渲染到对话界面
 * }
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
  addMessage: (message: ChatMessage) => Promise<HaiResult<void>>

  /**
   * 获取当前消息列表（压缩后）
   *
   * @returns 当前消息列表
   */
  getMessages: () => HaiResult<ChatMessage[]>

  /**
   * 获取当前 token 使用量
   *
   * @returns 当前 token 数和预算
   */
  getTokenUsage: () => HaiResult<{ current: number, budget: number }>

  /**
   * 获取历史摘要列表
   *
   * @returns 每次压缩产生的摘要
   */
  getSummaries: () => HaiResult<SummaryResult[]>

  /**
   * 持久化当前状态（需要 scope + 存储可用）
   *
   * 内部会先 `flush()` 等待所有后台记忆提取完成，确保持久化时记忆已写入。
   */
  save: () => Promise<HaiResult<void>>

  /**
   * 等待所有后台记忆提取任务完成
   *
   * chat/chatStream 的自动记忆提取是「即发即忘」的后台任务；在开始下一轮召回、
   * 生成总结或关闭前调用 `flush()`，可避免「上一轮记忆尚未写完」的时序问题（issue #14）。
   *
   * @returns 全部任务完成返回 ok(undefined)
   */
  flush: () => Promise<HaiResult<void>>

  /**
   * 当前挂起的后台记忆提取任务数量
   *
   * 供应用侧观测；为 0 表示无待写入的记忆任务。
   */
  readonly pendingMemoryTasks: number

  /**
   * 重置管理器
   *
   * 默认行为：终止活动轮次（进入终态并释放并发屏障）、清空消息 / 摘要 / 轮次 /
   * 待提交轮次，并重新写入系统提示词。可通过选项调整。
   *
   * @param options - 重置选项（保留系统提示词 / 终止活动轮次 / 等待记忆任务）
   * @returns 成功返回 ok(undefined)
   */
  reset: (options?: ContextResetOptions) => Promise<HaiResult<void>>

  /**
   * 获取对话轮次列表（Conversation Commit Layer）
   *
   * 记录每次 chat/chatStream 生成的轮次及其 `generated` / `committed` / `status`，
   * 供应用侧观测「模型生成」与「真实进入对话」的差异。
   *
   * @returns 轮次列表（按发生顺序）
   */
  getTurns: () => HaiResult<ConversationTurn[]>

  /**
   * 标记某轮次进入「表达中」（如 TTS 开始播放）
   *
   * 仅更新状态用于观测，不改变上下文内容。
   *
   * @param turnId - 轮次 ID
   * @returns 成功返回 ok(undefined)；轮次不存在返回 CONTEXT_TURN_NOT_FOUND
   */
  markTurnSpeaking: (turnId: string) => HaiResult<void>

  /**
   * 提交轮次（`turnCommit: 'manual'` 场景）
   *
   * 把真实文本写入上下文并触发记忆提取；`text` 缺省时使用模型生成的完整文本。
   * 提交后该轮 `status` 变为 `completed`。
   *
   * @param turnId - 轮次 ID
   * @param input - 提交内容（可覆盖为真实表达文本）
   * @returns 成功返回 ok(undefined)；轮次不存在或已提交返回对应错误
   */
  commitTurn: (turnId: string, input?: CommitTurnInput) => Promise<HaiResult<void>>

  /**
   * 打断轮次（`turnCommit: 'manual'` 场景）
   *
   * 只把「实际表达出去的部分」写入上下文；`text` 缺省时视为未表达任何内容（不写入）。
   * 打断后该轮 `status` 变为 `interrupted`。
   *
   * @param turnId - 轮次 ID
   * @param input - 实际表达出去的文本
   * @returns 成功返回 ok(undefined)；轮次不存在或已提交返回对应错误
   */
  interruptTurn: (turnId: string, input?: CommitTurnInput) => Promise<HaiResult<void>>

  /**
   * 将当前会话固化为长期记忆（Memory 生命周期）
   *
   * 流程：整合会话摘要（历史摘要 + 当前消息）→ 从摘要中提取长期记忆 → 以持久作用域写入。
   * 需要 deps.summary + deps.memory 可用。用于会话结束时把「短期会话记忆」沉淀为
   * 「跨会话长期记忆」，形成 Session → Summary → Long-term Memory 闭环。
   *
   * @param options - 固化选项（长期作用域、类型、模型等）
   * @returns 会话摘要与固化的记忆条目
   */
  consolidate: (options?: ConsolidateOptions) => Promise<HaiResult<ConsolidateResult>>

  /**
   * 发送消息并获取回复（需 deps.llm 可用）
   *
   * 流程：追加用户消息 → 自动压缩 → 注入记忆(可选) → RAG(可选) → LLM/Reasoning → 追加助手消息 → 提取记忆(可选)
   *
   * @param message - 用户消息文本
   * @param options - 单次请求覆盖选项
   * @returns 对话结果
   */
  chat: (message: string, options?: ContextChatOptions) => Promise<HaiResult<ContextChatResult>>

  /**
   * 流式发送消息并获取回复（需 deps.llm 可用）
   *
   * 产出事件序列：turn_started → delta* → done（中途取消时 → cancelled）
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
  createManager: (options?: ContextManagerOptions) => HaiResult<ContextManager>

  /**
   * 从持久化恢复上下文管理器
   *
   * @param scope - 交互作用域
   * @param options - 管理器配置覆盖
   * @returns 恢复的管理器实例
   */
  restoreManager: (scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>) => Promise<HaiResult<ContextManager>>

  /**
   * 列出指定主体的所有会话
   *
   * @param objectId - 主体 ID
   * @returns 会话信息列表
   */
  listSessions: (objectId: string) => Promise<HaiResult<SessionInfo[]>>

  /**
   * 重命名会话
   *
   * @param scope - 交互作用域（objectId + sessionId，用于多租户隔离）
   * @param title - 新标题
   * @returns 成功返回 ok(undefined)
   */
  renameSession: (scope: InteractionScope, title: string) => Promise<HaiResult<void>>

  /**
   * 删除会话（删除会话元数据和对应的上下文数据）
   *
   * @param scope - 交互作用域（objectId + sessionId，用于多租户隔离）
   * @returns 成功返回 ok(undefined)
   */
  removeSession: (scope: InteractionScope) => Promise<HaiResult<void>>
}
