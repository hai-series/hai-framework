import type { FeedbackAddMessageInput, FeedbackAttachment, FeedbackAttachmentData, FeedbackListInput, FeedbackMessage, FeedbackMessageQuery, FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, DmlWithTxOperations } from '@h-ai/reldb'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { FeedbackAttachmentSchema, FeedbackMessageSchema, FeedbackReportSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { feedbackM } from './feedback-i18n.js'
import { HaiFeedbackError } from './feedback-types.js'

const reports = 'hai_feedback_reports'
const messages = 'hai_feedback_messages'
const attachments = 'hai_feedback_attachments'
const reportColumns = [
  'id',
  'app_id',
  'scope_id',
  'user_id',
  'body',
  'status',
  'created_at',
  'updated_at',
] as const
const messageColumns = 'id, report_id, author_id, author_role, kind, body, created_at'
const attachmentColumns = 'id, message_id, name, content_type, size'

interface ReportRow {
  id: string
  app_id: string
  scope_id: string
  user_id: string
  body: string
  status: FeedbackReport['status']
  created_at: number | string | bigint
  updated_at: number | string | bigint
}

interface MessageRow {
  id: string
  report_id: string
  author_id: string
  author_role: FeedbackMessage['authorRole']
  kind: FeedbackMessage['kind']
  body: string
  created_at: number | string | bigint
}

interface AttachmentRow {
  id: string
  message_id: string | null
  name: string
  content_type: string
  size: number
}

function identityEquals(column: 'app_id' | 'scope_id' | 'user_id', value: string, params: unknown[]) {
  params.push(value)
  if (reldb.config?.type !== 'mysql')
    return `${column} = ?`
  // 保留索引预筛，同时排除 MySQL 不区分大小写和尾空格的默认比较。
  params.push(value)
  return `(${column} = ? AND CAST(${column} AS BINARY) = CAST(? AS BINARY))`
}

const indexes = [
  {
    table: reports,
    name: 'hai_feedback_reports_activity',
    columns: [
      'app_id',
      'scope_id',
      'updated_at',
      'id',
    ],
  },
  {
    table: reports,
    name: 'hai_feedback_reports_author',
    columns: [
      'app_id',
      'scope_id',
      'user_id',
      'updated_at',
      'id',
    ],
  },
  {
    table: messages,
    name: 'hai_feedback_messages_report',
    columns: ['report_id', 'created_at', 'id'],
  },
  {
    table: attachments,
    name: 'hai_feedback_attachments_message',
    columns: ['report_id', 'message_id', 'id'],
  },
]

async function ensureIndex(index: typeof indexes[number]): Promise<HaiResult<void>> {
  if (reldb.config?.type !== 'mysql')
    return reldb.ddl.createIndex(index.table, index.name, { columns: index.columns })

  async function inspect() {
    return reldb.sql.query<{ column_name: string, non_unique: number }>(
      'SELECT COLUMN_NAME AS column_name, NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX',
      [index.table, index.name],
    )
  }
  let existing = await inspect()
  if (!existing.success)
    return existing
  if (!existing.data.length) {
    const created = await reldb.ddl.createIndex(index.table, index.name, { columns: index.columns })
    if (created.success)
      return created
    // 多实例同时启动时，另一个连接可能先完成索引创建。
    existing = await inspect()
    if (!existing.success || !existing.data.length)
      return created
  }
  if (!existing.success)
    return existing
  const matches = existing.data.length === index.columns.length
    && existing.data.every((column, position) => column.column_name === index.columns[position] && Number(column.non_unique) === 1)
  return matches
    ? core.ok(undefined)
    : core.err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
}

function publicAttachment(row: AttachmentRow): FeedbackAttachment {
  return FeedbackAttachmentSchema.parse({
    id: row.id,
    name: row.name,
    contentType: row.content_type,
    size: row.size,
  })
}

/** 反馈、对话和附件共用一个关系库事务。 */
export class FeedbackReportRepository extends BaseReldbCrudRepository<ReportRow> {
  constructor() {
    super(reldb, {
      table: reports,
      createTableIfNotExists: false,
      fields: reportColumns.map(column => ({
        fieldName: column,
        columnName: column,
        def: {
          type: column === 'created_at' || column === 'updated_at'
            ? 'BIGINT'
            : 'TEXT',
        },
        select: true,
        create: true,
        update: false,
      })),
    })
  }

  async ready(): Promise<HaiResult<void>> {
    const type = reldb.config?.type
    const bytes = type === 'mysql'
      ? 'MEDIUMBLOB'
      : type === 'postgresql'
        ? 'BYTEA'
        : 'BLOB'
    // 正文需要真正的 TEXT；MySQL 通用 DDL 把 TEXT 映射成 VARCHAR(255)。
    const tables = [
      `CREATE TABLE IF NOT EXISTS ${reports} (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        app_id VARCHAR(128) NOT NULL,
        scope_id VARCHAR(128) NOT NULL,
        user_id VARCHAR(128) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(24) NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${messages} (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        report_id VARCHAR(36) NOT NULL,
        author_id VARCHAR(128) NOT NULL,
        author_role VARCHAR(16) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        body TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (report_id) REFERENCES ${reports}(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS ${attachments} (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        report_id VARCHAR(36) NOT NULL,
        message_id VARCHAR(36),
        name VARCHAR(255) NOT NULL,
        content_type VARCHAR(128) NOT NULL,
        size INTEGER NOT NULL,
        content ${bytes} NOT NULL,
        FOREIGN KEY (report_id) REFERENCES ${reports}(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES ${messages}(id) ON DELETE CASCADE
      )`,
    ]
    for (const statement of tables) {
      const result = await reldb.ddl.raw(statement)
      if (!result.success)
        return result
    }
    for (const index of indexes) {
      const result = await ensureIndex(index)
      if (!result.success)
        return result
    }
    return core.ok(undefined)
  }

  report(row: ReportRow): FeedbackReport {
    return FeedbackReportSchema.parse({
      id: row.id,
      appId: row.app_id,
      scopeId: row.scope_id,
      userId: row.user_id,
      body: row.body,
      status: row.status,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    })
  }

  message(row: MessageRow, files: FeedbackAttachment[]): FeedbackMessage {
    return FeedbackMessageSchema.parse({
      id: row.id,
      reportId: row.report_id,
      authorId: row.author_id,
      authorRole: row.author_role,
      kind: row.kind,
      body: row.body,
      createdAt: Number(row.created_at),
      attachments: files,
    })
  }

  async find(appId: string, scopeId: string, id: string, tx?: DmlWithTxOperations) {
    const sql = tx ?? reldb.sql
    const params: unknown[] = [id]
    const where = `id = ? AND ${identityEquals('app_id', appId, params)} AND ${identityEquals('scope_id', scopeId, params)}`
    if (tx && reldb.config?.type === 'sqlite') {
      // 先取得写事务，避免跨进程读后升级写事务产生过期快照。
      const locked = await sql.execute(`UPDATE ${reports} SET updated_at = updated_at WHERE ${where}`, params)
      if (!locked.success)
        return locked
    }
    const lock = tx && reldb.config?.type !== 'sqlite'
      ? ' FOR UPDATE'
      : ''
    return sql.get<ReportRow>(`SELECT ${reportColumns.join(', ')} FROM ${reports} WHERE ${where}${lock}`, params)
  }

  list(appId: string, scopeId: string, query: FeedbackListInput, userId?: string) {
    const params: unknown[] = []
    const conditions = [
      identityEquals('app_id', appId, params),
      identityEquals('scope_id', scopeId, params),
    ]
    if (userId !== undefined)
      conditions.push(identityEquals('user_id', userId, params))
    if (query.status) {
      params.push(query.status)
      conditions.push('status = ?')
    }
    return reldb.sql.queryPage<ReportRow>({
      sql: `SELECT ${reportColumns.join(', ')} FROM ${reports} WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC, id DESC`,
      params,
      pagination: { page: query.page, pageSize: query.pageSize },
    })
  }

  listMessages(query: FeedbackMessageQuery) {
    return reldb.sql.queryPage<MessageRow>({
      sql: `SELECT ${messageColumns} FROM ${messages} WHERE report_id = ? ORDER BY created_at DESC, id DESC`,
      params: [query.id],
      pagination: { page: query.page, pageSize: query.pageSize },
    })
  }

  findMessage(messageId: string, tx: DmlWithTxOperations) {
    return tx.get<MessageRow>(`SELECT ${messageColumns} FROM ${messages} WHERE id = ?`, [messageId])
  }

  addMessage(input: FeedbackAddMessageInput, authorId: string, authorRole: FeedbackMessage['authorRole'], time: number, tx: DmlWithTxOperations) {
    return tx.execute(`INSERT INTO ${messages} (${messageColumns}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      input.messageId,
      input.id,
      authorId,
      authorRole,
      input.kind,
      input.body,
      time,
    ])
  }

  updateActivity(id: string, status: FeedbackReport['status'], time: number, tx: DmlWithTxOperations) {
    return tx.execute(`UPDATE ${reports} SET status = ?, updated_at = ? WHERE id = ?`, [status, time, id])
  }

  async files(reportId: string, messageIds: string[] | null, sql: DmlOperations = reldb.sql) {
    const condition = messageIds
      ? `message_id IN (${messageIds.map(() => '?').join(', ')})`
      : 'message_id IS NULL'
    const result = await sql.query<AttachmentRow>(
      `SELECT ${attachmentColumns} FROM ${attachments} WHERE report_id = ? AND ${condition} ORDER BY id`,
      [
        reportId,
        ...(messageIds ?? []),
      ],
    )
    return result.success
      ? core.ok(result.data.map(row => ({
          messageId: row.message_id,
          file: publicAttachment(row),
        })))
      : result
  }

  async addFiles(reportId: string, messageId: string | null, files: FeedbackAttachmentData[], sql: DmlWithTxOperations) {
    const stored: FeedbackAttachment[] = []
    for (const file of files) {
      const content = Buffer.from(file.dataBase64, 'base64')
      const row: FeedbackAttachment = {
        id: randomUUID(),
        name: file.name,
        contentType: safeMediaType(file.contentType, content),
        size: content.length,
      }
      const saved = await sql.execute(`INSERT INTO ${attachments} (id, report_id, message_id, name, content_type, size, content) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        reportId,
        messageId,
        row.name,
        row.contentType,
        row.size,
        content,
      ])
      if (!saved.success)
        return saved
      stored.push(row)
    }
    return core.ok(stored)
  }

  async file(reportId: string, attachmentId: string) {
    const result = await reldb.sql.get<Pick<AttachmentRow, 'name' | 'content_type'> & { content: Uint8Array }>(
      `SELECT name, content_type, content FROM ${attachments} WHERE report_id = ? AND id = ?`,
      [reportId, attachmentId],
    )
    if (!result.success || !result.data) {
      return result.success
        ? core.ok(null)
        : result
    }
    return core.ok({
      name: result.data.name,
      contentType: result.data.content_type,
      dataBase64: Buffer.from(result.data.content).toString('base64'),
    })
  }
}

const rasterSignatures: Record<string, (bytes: Buffer) => boolean> = {
  'image/png': bytes => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
  'image/jpeg': bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
  'image/gif': bytes => ['GIF87a', 'GIF89a'].includes(bytes.toString('latin1', 0, 6)),
  'image/webp': bytes => bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP',
}

function safeMediaType(declared: string, bytes: Buffer) {
  const type = declared.toLowerCase()
  return rasterSignatures[type]?.(bytes)
    ? type
    : 'application/octet-stream'
}
