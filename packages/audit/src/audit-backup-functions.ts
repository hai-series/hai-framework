/** 归档编排复用 Storage 的流式条件写；不拥有存储或调度器的生命周期。 */
import type { HaiResult } from '@h-ai/core'
import type { SchedulerInitInput } from '@h-ai/scheduler'
import type { StorageFunctions } from '@h-ai/storage'
import type { AuditInitConfig } from './audit-config.js'
import type { AuditLogRepository } from './audit-repository-log.js'
import type { AuditBackupInfo, AuditBackupOperations, AuditFunctions } from './audit-types.js'
import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'
import { archiveLine, backupIdSchema, verifyArchive } from './audit-backup-format.js'
import { withAuditContext } from './audit-context.js'
import { readAuditTime } from './audit-database-time.js'
import { auditM } from './audit-i18n.js'
import { AUDIT_BACKUP_PREFIX, HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'backup' })
const optionsSchema = z.object({ id: backupIdSchema.optional(), from: z.date().optional(), to: z.date().optional(), signal: z.instanceof(AbortSignal).optional() })

/**
 * 内部归档服务；close 取消并等待本代操作，不会关闭宿主的 Storage。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function saveArchive(input: Parameters<typeof createAuditBackup>[0]) {
 *   const service = createAuditBackup(input)
 *   try { return await service.operations.run({ id: 'daily-archive' }) }
 *   finally { await service.close() }
 * }
 * ```
 */
export function createAuditBackup(input: { repository: AuditLogRepository, config: AuditInitConfig['backup'], storage?: StorageFunctions, capture: AuditFunctions['capture'] }) {
  let active = true
  const controllers = new Set<AbortController>()
  const pending = new Set<Promise<HaiResult<AuditBackupInfo>>>()

  function track(operation: (signal: AbortSignal) => Promise<HaiResult<AuditBackupInfo>>, event: { action: string, resourceId?: string, read?: boolean }, parent?: AbortSignal): Promise<HaiResult<AuditBackupInfo>> {
    if (!active)
      return Promise.resolve(err(HaiAuditError.NOT_INITIALIZED, auditM('audit_notInitialized')))
    const controller = new AbortController()
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal
    controllers.add(controller)
    const promise = Promise.resolve().then(async () => {
      if (!input.config.enabled || !input.storage?.isInitialized)
        return err(HaiAuditError.BACKUP_DISABLED, auditM('audit_backupDisabled'))
      signal.throwIfAborted()
      return operation(signal)
    }).catch((error: unknown) => {
      logger.error('Audit backup operation failed', { error })
      return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), error)
    }).then(async (result) => {
      const recorded = await input.capture({
        action: event.action,
        resource: 'audit',
        resourceId: result.success ? result.data.id : event.resourceId,
        category: 'system',
        outcome: result.success ? 'success' : result.error.httpStatus === 403 ? 'denied' : 'failure',
        details: result.success ? { key: result.data.key, recordCount: result.data.recordCount, sha256: result.data.sha256 } : { reasonCode: result.error.code },
      }, { read: event.read })
      if (!recorded.success)
        logger.error('Audit backup event failed', { action: event.action, error: recorded.error })
      return result
    }).finally(() => {
      controllers.delete(controller)
      pending.delete(promise)
    })
    pending.add(promise)
    return promise
  }

  async function read(key: string, signal: AbortSignal) {
    const opened = await input.storage!.file.getStream(key, { signal })
    if (!opened.success)
      return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), opened.error)
    try {
      return ok(await verifyArchive(opened.data, { key, maxRecordBytes: input.config.maxRecordBytes, signal }))
    }
    catch (error) {
      logger.error('Audit archive verification failed', { error })
      return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupVerificationFailed'), error)
    }
  }

  async function reuse(key: string, requestHash: string, signal: AbortSignal): Promise<HaiResult<AuditBackupInfo>> {
    const previous = await read(key, signal)
    if (!previous.success)
      return previous
    return previous.data.requestHash === requestHash
      ? ok(previous.data.info)
      : err(HaiAuditError.BACKUP_CONFLICT, auditM('audit_backupConflict'))
  }

  const operations: AuditBackupOperations = {
    run(options) {
      const parsed = optionsSchema.safeParse(options ?? {})
      if (!parsed.success)
        return Promise.resolve(err(HaiAuditError.BACKUP_INVALID, auditM('audit_backupInvalid')))
      const values = parsed.data
      const id = values.id ?? core.id.uuid()
      const from = values.from ? new Date(values.from.getTime()) : undefined
      const key = `${AUDIT_BACKUP_PREFIX}${id}.jsonl`
      const database = reldb.config
      const source = database?.type === 'sqlite' ? { type: database.type, database: database.database } : { type: database?.type, host: database?.host, port: database?.port, database: database?.database }
      const requestHash = createHash('sha256').update(JSON.stringify({ source, from: from?.toISOString() ?? null, to: values.to?.toISOString() ?? null })).digest('hex')
      return track(async (signal) => {
        const time = await readAuditTime()
        if (!time.success)
          return time
        const createdAt = time.data
        const cutoff = new Date(values.to?.getTime() ?? createdAt.getTime())
        if (cutoff > createdAt || (from && from > cutoff))
          return err(HaiAuditError.BACKUP_INVALID, auditM('audit_backupInvalid'))
        const exists = await input.storage!.file.exists(key)
        if (!exists.success)
          return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), exists.error)
        if (exists.data)
          return reuse(key, requestHash, signal)
        let completed: AuditBackupInfo | undefined
        async function* content() {
          const hash = createHash('sha256')
          const header = archiveLine({ type: 'header', format: 'hai-audit', version: 1, id, createdAt: createdAt.toISOString(), cutoff: cutoff.toISOString(), from: from?.toISOString() ?? null, requestHash }, input.config.maxRecordBytes)
          hash.update(header)
          yield header
          let afterId: string | undefined
          let count = 0
          while (true) {
            signal.throwIfAborted()
            const page = await input.repository.archivePage({ afterId, from, cutoff, limit: input.config.batchSize })
            if (!page.success)
              throw core.error.buildHaiErrorInst(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), page.error)
            for (const record of page.data) {
              signal.throwIfAborted()
              const line = archiveLine({ type: 'entry', record }, input.config.maxRecordBytes)
              hash.update(line)
              yield line
              if (!Number.isSafeInteger(++count))
                throw new Error('Audit archive record count exceeds safe range')
              afterId = record.id
            }
            if (page.data.length < input.config.batchSize)
              break
          }
          const sha256 = hash.digest('hex')
          yield archiveLine({ type: 'footer', recordCount: count, sha256 }, input.config.maxRecordBytes)
          completed = { id, key, recordCount: count, sha256, createdAt, cutoff }
        }
        const stream = content()
        let uploaded: Awaited<ReturnType<StorageFunctions['file']['put']>>
        try {
          uploaded = await input.storage!.file.put(key, stream, { ifNoneMatch: '*', contentType: 'application/x-ndjson', cacheControl: 'private, no-store', signal })
        }
        finally {
          await stream.return(undefined)
        }
        if (!uploaded.success) {
          // 外部写入结果不明或并发竞争时，以实际完整对象核对，不能盲目覆盖。
          const stored = await input.storage!.file.exists(key)
          if (stored.success && stored.data)
            return reuse(key, requestHash, signal)
          return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), uploaded.error)
        }
        if (!completed)
          return err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'))
        return ok(completed)
      }, { action: 'audit.backup', resourceId: id }, values.signal)
    },
    verify(key, options) {
      if (typeof key !== 'string' || !key.startsWith(AUDIT_BACKUP_PREFIX) || !key.endsWith('.jsonl') || !backupIdSchema.safeParse(key.slice(AUDIT_BACKUP_PREFIX.length, -6)).success)
        return Promise.resolve(err(HaiAuditError.BACKUP_INVALID, auditM('audit_backupInvalid')))
      const parsed = optionsSchema.pick({ signal: true }).safeParse(options ?? {})
      if (!parsed.success)
        return Promise.resolve(err(HaiAuditError.BACKUP_INVALID, auditM('audit_backupInvalid')))
      return track(async (signal) => {
        const result = await read(key, signal)
        return result.success ? ok(result.data.info) : result
      }, { action: 'audit.backup.verify', read: true }, parsed.data.signal)
    },
  }
  let schedule: Required<Pick<SchedulerInitInput, 'tasks' | 'hooks'>> | null = null
  if (input.config.enabled && input.config.schedule.enabled) {
    schedule = {
      tasks: [{ id: 'hai-audit-backup', name: auditM('audit_backupTaskName'), idempotent: true, cron: input.config.schedule.cron, timezone: input.config.schedule.timezone }],
      hooks: { onTaskExecute: async ({ context, signal }) => {
        if (context.taskId !== 'hai-audit-backup' || !context.occurrenceId)
          throw core.error.buildHaiErrorInst(HaiAuditError.BACKUP_INVALID, auditM('audit_backupInvalid'))
        // 回调由可信调度器调用；显式抛错才能使 Scheduler 正确记录失败，而非返回失败对象后算成功。
        const result = await withAuditContext({ actor: { id: 'system:audit-backup', username: 'scheduler' }, requestId: context.occurrenceId }, () => operations.run({ id: context.occurrenceId, signal }))
        if (!result.success)
          throw core.error.buildHaiErrorInst(HaiAuditError.BACKUP_FAILED, result.error.message, result.error)
        return result.data
      } },
    }
  }
  return {
    operations,
    schedule,
    async close() {
      active = false
      for (const controller of controllers)
        controller.abort()
      await Promise.allSettled([...pending])
    },
  }
}
