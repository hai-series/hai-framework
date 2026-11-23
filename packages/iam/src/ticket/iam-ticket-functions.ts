/**
 * @h-ai/iam — 一次性票据实现
 *
 * 基于 @h-ai/cache 实现短期、一次性能力票据：签发写入带 TTL 的 cache 键，
 * 缓存键使用票据摘要。消费先核验用途与时效，再原子删除相同记录。
 * @module ticket/iam-ticket-functions
 */

import type { HaiResult } from '@h-ai/core'

import type {
  ConsumedTicket,
  ConsumeTicketOptions,
  IssuedTicket,
  IssueTicketOptions,
  TicketGrant,
  TicketOperations,
} from './iam-ticket-types.js'
import { createHash } from 'node:crypto'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { generateToken } from '../session/iam-session-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'ticket' })

/** 票据缓存键前缀 */
const TICKET_KEY_PREFIX = 'hai:iam:ticket:'
/** 32 个随机字节编码为 base64url 后的长度和字符范围。 */
const TICKET_FORMAT = /^[\w-]{43}$/
/** 默认有效期（毫秒） */
const DEFAULT_TICKET_TTL_MS = 30_000

/**
 * 缓存中存储的票据记录
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const record: StoredTicket = { subjectId: 'user-1', purpose: 'ai-audio', grant: { operation: 'transcribe' }, expiresAt: Date.now() + 30000 }
 * const expired = record.expiresAt <= Date.now()
 * ```
 */
interface StoredTicket {
  /** 签发时已核验的主体，消费时不根据客户端 userId 替换。 */
  subjectId: string
  /** 单一用途绑定，消费前必须与请求用途核对。 */
  purpose: string
  /** 签发时授权的操作、模型、会话等参数快照。 */
  grant: TicketGrant
  /** Unix 毫秒截止时间；共享缓存原子消费仍独立核验有效期。 */
  expiresAt: number
}

/** 构建票据缓存键 */
function buildTicketKey(ticket: string): string {
  const digest = createHash('sha256').update(ticket).digest('hex')
  return `${TICKET_KEY_PREFIX}sha256:${digest}`
}

/**
 * 创建一次性票据操作接口
 * @returns 无本地票据真值的操作接口；issue/consume 使用已初始化的共享 Cache 并返回 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const tickets = createTicketOperations()
 * const issued = await tickets.issue({ subjectId: 'user-1', purpose: 'ai-audio' })
 * if (!issued.success)
 *   return issued
 * return tickets.consume(issued.data.ticket, { purpose: 'ai-audio' })
 * ```
 */
export function createTicketOperations(): TicketOperations {
  return {
    async issue(options: IssueTicketOptions): Promise<HaiResult<IssuedTicket>> {
      const ttlMs = options.ttlMs !== undefined && options.ttlMs > 0
        ? options.ttlMs
        : DEFAULT_TICKET_TTL_MS
      const ticket = generateToken()
      const expiresAt = Date.now() + ttlMs
      const record: StoredTicket = {
        subjectId: options.subjectId,
        purpose: options.purpose,
        grant: options.grant ?? {},
        expiresAt,
      }

      // NX 保证键唯一（随机值几乎不会碰撞，nx 兜底防止极端重复覆盖已有票据）
      const saved = await cache.kv.set(buildTicketKey(ticket), record, { px: ttlMs, nx: true })
      if (!saved.success || !saved.data) {
        logger.warn('Failed to issue ticket', { purpose: options.purpose })
        return core.err(HaiIamError.TICKET_ISSUE_FAILED, iamM('iam_ticketIssueFailed'))
      }

      return core.ok({ ticket, expiresAt })
    },

    async consume(ticket: string, options?: ConsumeTicketOptions): Promise<HaiResult<ConsumedTicket>> {
      // 老键兼容只接受曾签发的格式，不能以新键的 sha256:... 后缀绕过摘要。
      if (!TICKET_FORMAT.test(ticket)) {
        return core.err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }
      let key = buildTicketKey(ticket)
      let found = await cache.kv.get<StoredTicket>(key)
      if (found.success && !found.data) {
        // 兼容升级前尚未到期的票据，旧键仍由原 TTL 回收。
        key = `${TICKET_KEY_PREFIX}${ticket}`
        found = await cache.kv.get<StoredTicket>(key)
      }
      if (!found.success) {
        return core.err(HaiIamError.TICKET_ISSUE_FAILED, iamM('iam_ticketIssueFailed'))
      }
      const record = found.data
      if (!record) {
        return core.err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      // TTL 到期兜底（cache 已按 TTL 过期，此处防御时钟/后端差异）
      if (record.expiresAt <= Date.now()) {
        return core.err(HaiIamError.TICKET_EXPIRED, iamM('iam_ticketExpired'))
      }

      // 用途不符时保留票据，避免其它业务入口撤销本次操作。
      if (options?.purpose !== undefined && options.purpose !== record.purpose) {
        return core.err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      // 仅删除本次读到的记录。并发或过期导致比较失败时，本次消费无效。
      const removed = await cache.kv.compareAndSwap(key, record, undefined)
      if (!removed.success || !removed.data) {
        return core.err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      return core.ok({
        subjectId: record.subjectId,
        purpose: record.purpose,
        grant: record.grant,
      })
    },
  }
}
