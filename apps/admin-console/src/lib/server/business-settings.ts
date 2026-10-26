/** 示例业务配置仅管理公开公告，不接触系统凭据或安全策略。 */
import type { HaiResult } from '@h-ai/core'
import { audit } from '@h-ai/audit'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'

export const BusinessSettingsSchema = z.object({ notice: z.string().trim().max(200) }).strict()

export function initBusinessSettings(): Promise<HaiResult<void>> {
  return reldb.ddl.createTable('app_business_settings', { id: { type: 'TEXT', primaryKey: true }, notice: { type: 'TEXT', notNull: true } })
}

export async function readBusinessSettings(): Promise<HaiResult<{ notice: string }>> {
  const row = await reldb.sql.get<{ notice: string }>('SELECT notice FROM app_business_settings WHERE id = ?', ['public'])
  return row.success ? ok({ notice: row.data?.notice ?? '' }) : row
}

export async function saveBusinessSettings(input: { notice: string }): Promise<HaiResult<{ notice: string }>> {
  const parsed = BusinessSettingsSchema.safeParse(input)
  if (!parsed.success)
    return err(HaiCommonError.VALIDATION_ERROR)
  const begun = await reldb.tx.begin()
  if (!begun.success)
    return begun
  const tx = begun.data
  try {
    const sql = reldb.config?.type === 'mysql'
      ? 'INSERT INTO app_business_settings (id, notice) VALUES (?, ?) ON DUPLICATE KEY UPDATE notice = VALUES(notice)'
      : 'INSERT INTO app_business_settings (id, notice) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET notice = excluded.notice'
    const saved = await tx.execute(sql, ['public', parsed.data.notice])
    if (!saved.success) {
      await tx.rollback()
      return saved
    }
    const logged = await audit.capture({ action: 'business.configuration.update', resource: 'business-settings', category: 'business', details: { fields: ['notice'] } }, { tx })
    if (!logged.success) {
      await tx.rollback()
      return logged
    }
    const committed = await tx.commit()
    if (!committed.success)
      await tx.rollback()
    return committed.success ? ok(parsed.data) : committed
  }
  catch (error) {
    await tx.rollback()
    return err(HaiCommonError.INTERNAL_ERROR, undefined, error)
  }
}
