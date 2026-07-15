/**
 * @h-ai/iam — 一次性票据实现
 *
 * 基于 @h-ai/cache 实现短期、一次性能力票据：签发写入带 TTL 的 cache 键，
 * 消费通过「读取 + 原子删除」保证单次有效（并发消费仅一个成功）。
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

import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'

import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { generateToken } from '../session/iam-session-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'ticket' })

/** 票据缓存键前缀 */
const TICKET_KEY_PREFIX = 'hai:iam:ticket:'
/** 默认有效期（毫秒） */
const DEFAULT_TICKET_TTL_MS = 30_000

/** 缓存中存储的票据记录 */
interface StoredTicket {
  subjectId: string
  purpose: string
  grant: TicketGrant
  expiresAt: number
}

/** 构建票据缓存键 */
function buildTicketKey(ticket: string): string {
  return `${TICKET_KEY_PREFIX}${ticket}`
}

/**
 * 创建一次性票据操作接口
 */
export function createTicketOperations(): TicketOperations {
  return {
    async issue(options: IssueTicketOptions): Promise<HaiResult<IssuedTicket>> {
      const ttlMs = options.ttlMs !== undefined && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TICKET_TTL_MS
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
      if (!saved.success) {
        logger.warn('Failed to issue ticket', { purpose: options.purpose })
        return err(HaiIamError.TICKET_ISSUE_FAILED, iamM('iam_ticketIssueFailed'))
      }

      return ok({ ticket, expiresAt })
    },

    async consume(ticket: string, options?: ConsumeTicketOptions): Promise<HaiResult<ConsumedTicket>> {
      if (!ticket) {
        return err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }
      const key = buildTicketKey(ticket)

      const found = await cache.kv.get<StoredTicket>(key)
      if (!found.success) {
        return err(HaiIamError.TICKET_ISSUE_FAILED, iamM('iam_ticketIssueFailed'))
      }
      const record = found.data
      if (!record) {
        return err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      // 原子单次消费：删除计数为 1 的调用方胜出；并发消费的其余调用方得到 0 → 视为已消费
      const removed = await cache.kv.del(key)
      if (!removed.success || removed.data !== 1) {
        return err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      // TTL 到期兜底（cache 已按 TTL 过期，此处防御时钟/后端差异）
      if (record.expiresAt <= Date.now()) {
        return err(HaiIamError.TICKET_EXPIRED, iamM('iam_ticketExpired'))
      }

      // 用途校验：防止跨用途重放
      if (options?.purpose !== undefined && options.purpose !== record.purpose) {
        return err(HaiIamError.TICKET_INVALID, iamM('iam_ticketInvalid'))
      }

      return ok({
        subjectId: record.subjectId,
        purpose: record.purpose,
        grant: record.grant,
      })
    },
  }
}
