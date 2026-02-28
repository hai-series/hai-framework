import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type AuditMessageKey = keyof typeof messagesZhCN

/**
 * 审计模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @param options - 插值参数
 * @returns 本地化后的文案字符串
 */
export const auditM = core.i18n.createMessageGetter<AuditMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
