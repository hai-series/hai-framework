/** 固定窗口告警：只查询已提交事件，持久领取先于外部通知，无隐式重试队列。 */
import type { HaiResult } from '@h-ai/core'
import type { ReachFunctions } from '@h-ai/reach'
import type { SchedulerInitInput } from '@h-ai/scheduler'
import type { AuditInitConfig } from './audit-config.js'
import type { AuditAlertReport, AuditFunctions } from './audit-types.js'
import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { withAuditContext } from './audit-context.js'
import { auditClockSql, readAuditTime } from './audit-database-time.js'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'alerts' })
const levels = ['info', 'warning', 'error', 'critical'] as const
const table = 'hai_audit_alert_claims'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * 模块内部告警实现；Reach 和共享数据库由宿主拥有，close 只排空自己的检查。
 * @example 模块内部上下文
 * ```ts
 * async function check(input: Parameters<typeof createAuditAlerts>[0]) {
 *   const service = createAuditAlerts(input)
 *   try { return await service.check() }
 *   finally { await service.close() }
 * }
 * ```
 */
export function createAuditAlerts(input: { config: AuditInitConfig['alerts'], reach?: ReachFunctions, log: AuditFunctions['log'] }) {
  let active = true
  const controllers = new Set<AbortController>()
  const pending = new Set<Promise<HaiResult<AuditAlertReport>>>()

  async function run(signal: AbortSignal): Promise<HaiResult<AuditAlertReport>> {
    if (!input.config.enabled)
      return err(HaiAuditError.ALERTS_DISABLED, auditM('audit_alertsDisabled'))
    signal.throwIfAborted()
    const type = reldb.config?.type
    const clock = auditClockSql()
    const time = await readAuditTime()
    if (!time.success)
      return time
    const now = time.data.getTime()
    const report: AuditAlertReport = { submitted: 0, queued: 0, failed: 0, more: false }
    let attempted = 0
    for (const rule of input.config.rules) {
      const duration = rule.windowSeconds * 1000
      const current = Math.floor(now / duration) * duration
      // 本窗口加前一窗口：避免阈值刚好在调度边界前达到时漏报；停机超过两窗不补发历史风暴。
      for (const start of [current - duration, current]) {
        signal.throwIfAborted()
        const end = Math.min(start + duration, now + 1)
        const actions = [...new Set(rule.actions)].sort()
        const outcomes = [...new Set(rule.outcomes)].sort()
        const severities = levels.slice(levels.indexOf(rule.minimumSeverity))
        const date = (value: number) => type === 'sqlite' ? value : new Date(value)
        const conditions = ['created_at >= ?', 'created_at < ?', 'resource <> ?', `action IN (${actions.map(() => '?').join(',')})`]
        const params: unknown[] = [date(start), date(end), 'audit.alert', ...actions]
        if (outcomes.length) {
          conditions.push(`outcome IN (${outcomes.map(() => '?').join(',')})`)
          params.push(...outcomes)
        }
        if (rule.minimumSeverity !== 'info') {
          conditions.push(`severity IN (${severities.map(() => '?').join(',')})`)
          params.push(...severities)
        }
        if (rule.resource) {
          conditions.push('resource = ?')
          params.push(rule.resource)
        }
        const counted = await reldb.sql.get<{ count: number | string }>(`SELECT COUNT(*) AS count FROM hai_audit_logs WHERE ${conditions.join(' AND ')}`, params)
        if (!counted.success)
          return counted
        const count = Number(counted.data?.count)
        if (!Number.isSafeInteger(count) || count < 0)
          return err(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed'))
        if (count < rule.threshold)
          continue
        for (const target of rule.targets) {
          signal.throwIfAborted()
          const id = hash({ rule: { ...rule, actions, outcomes, targets: undefined }, target, start })
          if (attempted >= input.config.maxNotificationsPerCheck) {
            const existing = await reldb.sql.get<{ id: string }>(`SELECT id FROM ${table} WHERE id=?`, [id])
            if (!existing.success)
              return existing
            if (!existing.data)
              report.more = true
            continue
          }
          // 最终领取使用存储端执行时钟；检查暂停或锁等待后不能重新领取已过期、已清理的旧窗口。
          const selection = `SELECT ?, ?, ?, ?, 'claimed' WHERE ? <= ${clock} AND ? > ${clock}`
          const statement = type === 'mysql'
            ? `INSERT IGNORE INTO ${table} (id, rule_id, target_id, window_start, status) ${selection}`
            : `INSERT INTO ${table} (id, rule_id, target_id, window_start, status) ${selection} ON CONFLICT(id) DO NOTHING`
          const claimed = await reldb.sql.execute(statement, [id, rule.id, target.id, start, start, start + duration * 2])
          if (!claimed.success)
            return claimed
          if (claimed.data.changes === 0)
            continue
          attempted++
          const details = { ruleId: rule.id, targetId: target.id, count, windowStart: new Date(start).toISOString(), windowEnd: new Date(start + duration).toISOString(), level: rule.severity }
          const recorded = await input.log({ action: 'audit.alert.claimed', resource: 'audit.alert', resourceId: id, category: 'system', severity: rule.severity, outcome: 'success', details })
          if (!recorded.success)
            return recorded
          // 领取后取消仍保留 claimed，不能把未知外部效果重新当作从未执行。
          signal.throwIfAborted()
          // 首次 INSERT 或审计写入也可能等待；发送前再以数据库时钟确认，sending/unknown 不自动清除。
          const sending = await reldb.sql.execute(`UPDATE ${table} SET status='sending' WHERE id=? AND status='claimed' AND ? > ${clock}`, [id, start + duration * 2])
          if (!sending.success)
            return sending
          if (sending.data.changes !== 1)
            continue
          const sent = await input.reach!.send({ provider: target.provider, to: target.to, subject: auditM('audit_alertSubject', { params: { severity: rule.severity, rule: rule.id } }), body: JSON.stringify(details), idempotencyKey: id })
          const accepted = sent.success && sent.data.success
          const status = accepted ? (sent.data.deferred ? 'queued' : 'submitted') : 'unknown'
          const updated = await reldb.sql.execute(`UPDATE ${table} SET status=?, queue_id=?, error_code=? WHERE id=? AND status='sending'`, [status, sent.success && sent.data.deferred ? sent.data.queueId : null, sent.success ? null : sent.error.code, id])
          if (!updated.success || updated.data.changes !== 1)
            return err(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed'), updated.success ? undefined : updated.error)
          if (status === 'queued')
            report.queued++
          else if (status === 'submitted')
            report.submitted++
          else
            report.failed++
          const outcome = await input.log({ action: 'audit.alert.notification', resource: 'audit.alert', resourceId: id, category: 'system', severity: rule.severity, outcome: accepted ? 'success' : 'failure', details: { ...details, status, ...(sent.success ? {} : { reasonCode: sent.error.code }), ...(sent.success && sent.data.deferred ? { queueId: sent.data.queueId } : {}) } })
          if (!outcome.success)
            return outcome
          if (!accepted)
            logger.error('Audit alert notification outcome requires review', { id, ruleId: rule.id, targetId: target.id, errorCode: sent.success ? undefined : sent.error.code })
        }
      }
    }
    // 只删除查询范围外的领取。当前/前一窗口永远不会因清理重新发送。
    const oldest = now - Math.max(...input.config.rules.map(rule => rule.windowSeconds * 1000)) * 3
    const cleaned = await reldb.sql.execute(`DELETE FROM ${table} WHERE window_start < ? AND status IN ('submitted', 'queued')`, [oldest])
    return cleaned.success ? ok(report) : cleaned
  }

  const check: AuditFunctions['checkAlerts'] = (options) => {
    if (!active)
      return Promise.resolve(err(HaiAuditError.NOT_INITIALIZED, auditM('audit_notInitialized')))
    if (options?.signal !== undefined && !(options.signal instanceof AbortSignal))
      return Promise.resolve(err(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed')))
    const controller = new AbortController()
    const cancel = () => controller.abort()
    options?.signal?.addEventListener('abort', cancel, { once: true })
    if (options?.signal?.aborted)
      cancel()
    controllers.add(controller)
    const operation = withAuditContext({ actor: { id: 'system:audit-alerts', username: 'scheduler' }, category: 'system' }, () => run(controller.signal)).catch((error: unknown) => {
      logger.error('Audit alert check failed', { error })
      return err(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed'), error)
    })
    pending.add(operation)
    void operation.finally(() => {
      controllers.delete(controller)
      pending.delete(operation)
      options?.signal?.removeEventListener('abort', cancel)
    })
    return operation
  }
  let schedule: Required<Pick<SchedulerInitInput, 'tasks' | 'hooks'>> | null = null
  if (input.config.enabled && input.config.schedule.enabled) {
    schedule = {
      tasks: [{ id: 'hai-audit-alerts', name: auditM('audit_alertTaskName'), idempotent: true, cron: input.config.schedule.cron, timezone: input.config.schedule.timezone }],
      hooks: { onTaskExecute: async ({ context, signal }) => {
        if (context.taskId !== 'hai-audit-alerts')
          throw core.error.buildHaiErrorInst(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed'))
        const result = await check({ signal })
        if (!result.success || result.data.failed > 0)
          throw core.error.buildHaiErrorInst(HaiAuditError.ALERTS_FAILED, auditM('audit_alertsFailed'), result.success ? undefined : result.error)
        return result.data
      } },
    }
  }
  return {
    check,
    schedule,
    async close() {
      active = false
      controllers.forEach(controller => controller.abort())
      await Promise.allSettled([...pending])
    },
  }
}
