/** 应用自己的定时任务装配；Scheduler 先于 IAM/Audit 关闭，不修改全局回调所属关系。 */
import type { HaiResult } from '@h-ai/core'
import * as m from '$lib/paraglide/messages.js'
import { audit } from '@h-ai/audit'
import { core, err, ok } from '@h-ai/core'
import { HaiSchedulerError, scheduler, SchedulerConfigSchema } from '@h-ai/scheduler'

/** 仅启用自动备份或告警时启动现有调度器；手动操作不需要启动它。 */
export async function startAuditJobs(): Promise<HaiResult<void>> {
  const schedule = audit.schedulerPlan
  if (!schedule)
    return ok(undefined)
  const config = SchedulerConfigSchema.safeParse(core.config.get('scheduler') ?? {})
  if (!config.success)
    return err(HaiSchedulerError.CONFIG_ERROR, m.common_error(), config.error)
  const initialized = await scheduler.init({
    ...config.data,
    ...schedule,
  })
  if (!initialized.success) {
    await scheduler.close()
    return initialized
  }
  const started = scheduler.start()
  if (!started.success)
    await scheduler.close()
  return started
}
