/**
 * @h-ai/ai — A2A（Agent-to-Agent）子功能类型
 *
 * 定义 A2A 协议集成所需的类型、SDK 类型再导出、操作接口。
 * @module ai-a2a-types
 */

import type { AgentCard } from '@a2a-js/sdk'
import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { HaiResult } from '@h-ai/core'

import type { StorePage } from '../store/ai-store-types.js'

// ─── SDK 类型再导出（协议层） ───

export type {
  AgentCapabilities,
  AgentCard,
  AgentProvider,
  AgentSkill,
  Artifact,
  DataPart,
  FilePart,
  FileWithBytes,
  FileWithUri,
  Message,
  MessageSendParams,
  Part,
  PushNotificationConfig,
  Task,
  TaskArtifactUpdateEvent,
  TaskIdParams,
  TaskQueryParams,
  TaskState,
  TaskStatus,
  TaskStatusUpdateEvent,
  TextPart,
} from '@a2a-js/sdk'

export type {
  TaskStore as A2ATaskStore,
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
  ServerCallContext,
} from '@a2a-js/sdk/server'

// ─── A2A 消息记录（持久化用） ───

/** A2A 调用方身份信息 */
export interface A2ACallerIdentity {
  /** 调用方 Agent ID（如 AgentCard.name 或自定义标识） */
  agentId: string
  /** 调用方显示名 */
  name?: string
  /** 调用方 URL（AgentCard 地址） */
  url?: string
}

/** A2A 消息记录（存储每条 A2A 交互） */
export interface A2AMessageRecord {
  /** 记录 ID（自动生成） */
  id: string
  /** 关联的 A2A Task ID */
  taskId: string
  /** 所属会话上下文 ID（历史记录可能缺失） */
  contextId?: string
  /** 消息角色：user（入站请求）/ agent（出站响应） */
  role: 'user' | 'agent'
  /** 消息内容（JSON 序列化的 Part[] 数组） */
  parts: unknown[]
  /** 调用方身份信息（仅 role=user 时） */
  caller?: A2ACallerIdentity
  /** 创建时间戳（毫秒） */
  createdAt: number
}

/** A2A 上下文信息（对话/会话级别） */
export interface A2AContextInfo {
  /** 上下文 ID（对应 SDK 的 contextId） */
  id: string
  /** 关联的 Agent 标识 */
  agentId?: string
  /** 上下文标题（可选） */
  title?: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
}

// ─── A2A 认证接口 ───

/**
 * A2A 认证器接口
 *
 * 纯接口设计，由应用层实现，Kit 模块做胶水集成。
 * 用于验证入站 A2A 请求的身份。
 */
export interface A2AAuthenticator {
  /**
   * 验证入站请求
   *
   * @param headers - HTTP 请求头
   * @returns 成功返回调用方身份信息，失败返回错误
   */
  authenticate: (headers: Record<string, string | undefined>) => Promise<HaiResult<A2ACallerIdentity>>
}

// ─── A2A 任务过滤器 ───

/** A2A 任务查询过滤器 */
export interface A2ATaskFilter {
  /** 按消息角色过滤（user / agent），不是任务生命周期状态 */
  status?: string | string[]
  /** 按上下文 ID 过滤 */
  contextId?: string
  /** 按调用方 Agent ID 过滤 */
  callerId?: string
  /** 时间范围起始（毫秒） */
  since?: number
  /** 最大返回数 */
  limit?: number
  /** 偏移量 */
  offset?: number
}

// ─── A2A 操作接口 ───

/**
 * A2A 操作接口
 *
 * 提供 Agent-to-Agent 协议能力：Agent Card 管理、请求处理、客户端调用。
 */
export interface A2AOperations {
  /**
   * 注册 Agent 执行器
   *
   * 需要先调用 `ai.init()` 并配置 `a2a` 后才能注册。
   * 注册后 `handleRequest()`、`listMessages()` 等方法即可使用。
   *
   * @param executor - Agent 执行器（由应用层实现）
   * @returns 注册成功返回 `ok(undefined)`；未配置/未初始化返回 `err(HaiAIError.*)`
   */
  registerExecutor: (executor: AgentExecutor) => HaiResult<void>

  /**
   * 获取当前 Agent Card
   *
   * 配置了 a2a 后即可使用，无需注册 executor。
   *
   * @returns 符合 A2A 0.3 的完整 Agent Card（含能力与安全方案）
   */
  getAgentCard: () => HaiResult<AgentCard>

  /**
   * 处理入站 JSON-RPC 请求
   *
   * 将 HTTP 请求体路由到 SDK 的 JsonRpcTransportHandler。
   *
   * @param requestBody - JSON-RPC 请求体
   * @param context - 可信 HTTP 层认证上下文；agentId 映射为 SDK user.userName
   * @returns JSON-RPC 响应（单条或流式）；未初始化也返回 JSON-RPC 错误，不混入 HaiResult
   */
  handleRequest: (requestBody: unknown, context?: Record<string, unknown>) => Promise<A2AHandleResult>

  /**
   * 查询 A2A 消息列表（服务端管理接口，不自动推断调用方权限）
   *
   * @param filter - 查询过滤器
   * @returns 分页的消息记录列表
   */
  listMessages: (filter: A2ATaskFilter) => Promise<HaiResult<StorePage<A2AMessageRecord>>>

  /**
   * 作为客户端调用远端 Agent
   *
   * remoteUrl 只应来自受信配置。框架校验协议和内嵌凭据，应用仍须按部署环境实施来源白名单与出口策略。
   *
   * @param remoteUrl - 远端 Agent 的 A2A 端点 URL
   * @param message - 发送的消息文本
   * @param options - 调用选项
   * @returns 远端响应
   */
  callRemoteAgent: (remoteUrl: string, message: string, options?: A2ACallOptions) => Promise<HaiResult<A2ACallResult>>
}

// ─── 辅助类型 ───

/** A2A API Key 安全配置 */
export interface A2AApiKeySecurity {
  /** API Key 的传递位置 */
  in: 'header' | 'query'
  /** 参数名 */
  name: string
}

/** A2A 安全认证配置 */
export interface A2ASecurityConfig {
  /** API Key 认证配置 */
  apiKey?: A2AApiKeySecurity
}

/** Agent Card 配置（应用层提供） */
export interface A2AAgentCardConfig {
  /** Agent 名称 */
  name: string
  /** Agent 描述 */
  description?: string
  /** Agent URL（对外可访问的 base URL） */
  url: string
  /** Agent 版本 */
  version?: string
  /** Agent 能力声明 */
  skills?: Array<{
    id: string
    name: string
    description?: string
    tags?: string[]
  }>
  /** 安全认证配置（体现在 Agent Card 的 securitySchemes / security 字段） */
  security?: A2ASecurityConfig
}

/** 处理结果（单条或流式） */
export interface A2AHandleResult {
  /** 是否为流式响应 */
  streaming: boolean
  /** 单条 JSON-RPC 响应体（非流式时） */
  body?: unknown
  /** 流式 JSON-RPC 响应迭代器（流式时） */
  stream?: AsyncGenerator<unknown, void, undefined>
}

/** 远端调用选项 */
export interface A2ACallOptions {
  /** 超时时间（毫秒），默认 60 秒。 */
  timeout?: number
  /** 额外请求头 */
  headers?: Record<string, string>
}

/** 远端调用结果 */
export interface A2ACallResult {
  /** 远端任务 ID */
  taskId?: string
  /** 任务最终状态 */
  taskState?: string
  /** 响应消息文本 */
  responseText?: string
  /** 响应消息 Part 数组 */
  responseParts?: unknown[]
}
