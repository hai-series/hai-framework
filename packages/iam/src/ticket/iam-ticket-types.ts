/**
 * @h-ai/iam — 一次性票据类型
 *
 * 定义通用的短期、一次性能力票据（capability ticket）：由已认证的上下文签发，
 * 绑定主体、用途与授权信息，在无法携带 Bearer Token 的通道（如 WebSocket URL）中
 * 用作一次性入场凭证。典型用途：AI 语音 WebSocket 接入。
 * @module ticket/iam-ticket-types
 */

import type { HaiResult } from '@h-ai/core'

/**
 * 票据授权绑定信息
 *
 * 消费时原样返回，供服务端确认本次操作、模型、会话等参数与签发时一致。
 * 除固定字段外允许应用自定义键值。
 */
export interface TicketGrant {
  /** 操作类型（如 `'transcribe'` | `'synthesize'` 或应用自定义） */
  operation?: string
  /** 模型 ID */
  model?: string
  /** 会话 ID */
  sessionId?: string
  /** 应用自定义绑定字段 */
  [key: string]: unknown
}

/**
 * 签发一次性票据的选项
 */
export interface IssueTicketOptions {
  /** 主体 ID（票据绑定的用户 / 主体，消费时原样返回） */
  subjectId: string
  /** 票据用途（如 `'ai-audio'`），消费时校验一致 */
  purpose: string
  /** 授权绑定信息（操作 / 模型 / 会话等，消费时原样返回） */
  grant?: TicketGrant
  /** 有效期（毫秒，默认 30000） */
  ttlMs?: number
}

/**
 * 签发结果
 */
export interface IssuedTicket {
  /** 一次性票据值（密码学安全随机，base64url） */
  ticket: string
  /** 过期时间（Unix 毫秒） */
  expiresAt: number
}

/**
 * 消费票据的选项
 */
export interface ConsumeTicketOptions {
  /** 期望用途；与签发用途不一致时返回 `TICKET_INVALID`（防止跨用途重放） */
  purpose?: string
}

/**
 * 消费结果（校验通过并原子消费后返回）
 */
export interface ConsumedTicket {
  /** 票据绑定的主体 ID */
  subjectId: string
  /** 票据用途 */
  purpose: string
  /** 授权绑定信息 */
  grant: TicketGrant
}

/**
 * 一次性票据操作接口（通过 `iam.ticket` 访问）
 *
 * 提供密码学安全、带 TTL、原子单次消费的能力票据签发与消费。
 */
export interface TicketOperations {
  /**
   * 签发一次性票据
   *
   * 生成密码学安全随机值，绑定主体 / 用途 / 授权信息并按 TTL 存入 cache。
   *
   * @param options - 签发选项
   * @returns 票据值与过期时间
   */
  issue: (options: IssueTicketOptions) => Promise<HaiResult<IssuedTicket>>

  /**
   * 原子消费一次性票据
   *
   * 单次有效：并发消费同一票据时只有一个成功，其余返回 `TICKET_INVALID`。
   * 票据不存在 / 已过期 / 已消费 / 用途不匹配时返回错误。
   *
   * @param ticket - 票据值
   * @param options - 消费选项（可校验用途）
   * @returns 主体 + 用途 + 授权信息
   */
  consume: (ticket: string, options?: ConsumeTicketOptions) => Promise<HaiResult<ConsumedTicket>>
}
