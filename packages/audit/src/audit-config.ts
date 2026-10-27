/**
 * @h-ai/audit — 错误码与配置
 *
 * 定义审计模块的错误码常量与初始化配置类型。
 * @module audit-config
 */

import type { ReachFunctions } from '@h-ai/reach'
import type { StorageFunctions } from '@h-ai/storage'
import { z } from 'zod'

// ─── 初始化配置 ───

/**
 * 审计模块初始化配置 Schema（Zod）
 *
 * 所有字段均有默认值，可直接调用 `audit.init()` 无需传参。
 * @example
 * ```ts
 * import { AuditInitConfigSchema } from '@h-ai/audit'
 * const config = AuditInitConfigSchema.parse({ userTable: 'app_users' })
 * // 这里只校验字段映射；实际初始化前必须已有可用的 RelDB。
 * ```
 */
export const AuditInitConfigSchema = z.object({
  /** 以固定时间窗口统计已提交事件；目标和事件由应用配置，不内置业务角色。 */
  alerts: z.object({
    /** 是否检查异常事件并发送告警；开启前配置至少一条规则和真实 Reach 通道，关闭不影响审计入库。 */
    enabled: z.boolean().default(false),
    /** 每次检查最多尝试的通知数；超过的目标留待后续检查，避免突发告警挤占业务资源。 */
    maxNotificationsPerCheck: z.number().int().min(1).max(1000).default(100),
    /** 告警规则列表；每条按全站匹配事件的固定窗口累计计数，不是每个账号各自计数。 */
    rules: z.array(z.object({
      /** 稳定且唯一的规则编号，用于共享去重；更改编号会视为新规则。 */
      id: z.string().regex(/^[\w-]{1,64}$/),
      /** 匹配的审计 action 全名，例如 auth.login；从实际记录复制，不支持 auth.* 通配。 */
      actions: z.array(z.string().trim().min(1).max(128)).min(1).max(50),
      /** 只统计此资源类型的事件；省略时不按资源过滤，不填写业务敏感正文。 */
      resource: z.string().trim().min(1).max(256).optional(),
      /** 要统计的执行结果；默认失败和拒绝，空数组表示所有结果均参与计数。 */
      outcomes: z.array(z.enum(['success', 'failure', 'denied'])).max(3).default(['failure', 'denied']),
      /** 参与计数的事件最低等级；低于此级别的记录仍保留，但不触发这条告警。 */
      minimumSeverity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
      /** 发出通知时的告警等级；不修改原始审计事件的等级。 */
      severity: z.enum(['warning', 'error', 'critical']).default('warning'),
      /** 同一窗口内累计达到此次数才通知；与 IAM 登录失败锁定阈值分别配置。 */
      threshold: z.number().int().min(1).max(1000000000).default(1),
      /** 固定计数窗口长度，单位秒；例如 300 表示按五分钟窗口统计，不追补长期停机历史。 */
      windowSeconds: z.number().int().min(60).max(86400).default(300),
      /** 通知接收目标；每个目标独立记录投递结果，渠道受理不等于人员已读。 */
      targets: z.array(z.object({
        /** 本规则内稳定且唯一的目标编号，用于防止多节点重复投递。 */
        id: z.string().regex(/^[\w-]{1,64}$/),
        /** 已注册的 Reach Provider 名称，例如 email；不是 smtp/api 等 Provider 类型。 */
        provider: z.string().trim().min(1).max(128),
        /** 该通道接受的收件地址，例如邮箱或手机号；填写真实值，开发 Console 不会投递。 */
        to: z.string().trim().min(1).max(1000),
      })).min(1).max(20).refine(targets => new Set(targets.map(target => target.id)).size === targets.length),
    })).max(20).default([]).refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length),
    /** 自动告警检查计划；宿主需接入 audit.schedulerPlan，只开启告警功能不会自动轮询。 */
    schedule: z.object({
      /** 是否让 Scheduler 自动检查；需同时开启 alerts.enabled，否则仅保留计划配置。 */
      enabled: z.boolean().default(false),
      /** 检查频率的 Cron 表达式；默认每分钟检查，窗口阈值仍由规则决定。 */
      cron: z.string().trim().min(1).max(128).default('* * * * *'),
      /** Cron 使用的 IANA 时区，例如 Asia/Shanghai；UTC 不等于北京时间。 */
      timezone: z.string().trim().min(1).max(128).default('UTC'),
    }).default({ enabled: false, cron: '* * * * *', timezone: 'UTC' }),
  }).default({ enabled: false, maxNotificationsPerCheck: 100, rules: [], schedule: { enabled: false, cron: '* * * * *', timezone: 'UTC' } }).refine(alerts => !alerts.enabled || alerts.rules.length > 0),
  /** 可选的流式归档；自动执行由宿主现有 Scheduler 装配。 */
  backup: z.object({
    /** 是否允许手动/计划归档审计；需已初始化的私有 Storage，关闭不影响审计采集。 */
    enabled: z.boolean().default(false),
    /** 每批读取的记录数；较小更省内存但请求更多，不改变归档内容。 */
    batchSize: z.number().int().min(1).max(1000).default(200),
    /** 单条归档记录的 UTF-8 字节上限；默认 1 MiB，超限报错而不截断原审计。 */
    maxRecordBytes: z.number().int().min(1024).max(64 * 1024 * 1024).default(1024 * 1024),
    /** 自动备份计划；与手动备份开关独立，备份不会删除源日志，也不是原子数据库快照。 */
    schedule: z.object({
      /** 是否由 Scheduler 自动备份；还需 backup.enabled=true，关闭后仍可手动备份。 */
      enabled: z.boolean().default(false),
      /** 备份 Cron 表达式；0 2 * * * 表示在下方时区每天 02:00 执行。 */
      cron: z.string().trim().min(1).max(128).default('0 2 * * *'),
      /** 定时备份采用的 IANA 时区；Asia/Shanghai 为北京时间，UTC 的 02:00 对应北京时间 10:00。 */
      timezone: z.string().trim().min(1).max(128).default('UTC'),
    }).default({ enabled: false, cron: '0 2 * * *', timezone: 'UTC' }),
  }).default({ enabled: false, batchSize: 200, maxRecordBytes: 1024 * 1024, schedule: { enabled: false, cron: '0 2 * * *', timezone: 'UTC' } }),
  /** 框架入口自动采集；显式 audit.log 不受此开关影响。 */
  capture: z.object({
    /** 是否自动记录已接入框架入口的重要操作、失败和拒绝；关闭不阻止显式 audit.log 写入。 */
    enabled: z.boolean().default(true),
    /** 是否也采集成功读取事件；开启可追溯查询行为，但会显著增加日志量与存储开销。 */
    includeReads: z.boolean().default(false),
  }).default({ enabled: true, includeReads: false }),
  /** 未传时沿用数据库保留设置；显式关闭才解除保护。 */
  retention: z.object({
    /** 是否启用共享数据库的审计修改/删除/覆盖保护；配置会持久化，移除配置不会解除已有保护。 */
    enabled: z.boolean().default(false),
    /** 保护期天数；例如 90 天内 cleanup(0) 也不能删除，到期不会自动清理日志。 */
    minDays: z.number().int().min(1).max(36500).default(90),
  }).optional(),
  /** 凭据始终脱敏；此开关仅控制业务隐私字段。 */
  privacy: z.object({
    /** 是否对业务隐私字段脱敏；关闭也不会暴露密码、token 等凭据，脱敏前的内容不会恢复。 */
    enabled: z.boolean().default(true),
    /** 额外脱敏的详情字段名，不区分大小写；例如 customerPhone，不要将秘密放进 action/resourceId。 */
    fields: z.array(z.string().trim().min(1).max(256)).max(1000).default([]),
  }).default({ enabled: true, fields: [] }),
  /** 用户表名，用于 list 查询时 LEFT JOIN 获取用户名 */
  userTable: z.string().default('hai_iam_users'),
  /** 用户表主键列名，用于 JOIN 条件 */
  userIdColumn: z.string().default('id'),
  /** 用户表用户名列名，用于 SELECT 输出 */
  userNameColumn: z.string().default('username'),
})

/**
 * 审计模块初始化配置（解析后）
 * @example
 * ```ts
 * import { AuditInitConfigSchema, type AuditInitConfig } from '@h-ai/audit'
 * const config: AuditInitConfig = AuditInitConfigSchema.parse({ userTable: 'app_users' })
 * ```
 */
export type AuditInitConfig = z.output<typeof AuditInitConfigSchema>

/**
 * 审计模块初始化配置（传入参数）
 * @example
 * ```ts
 * import type { AuditInitConfigInput } from '@h-ai/audit'
 * const record: AuditInitConfigInput = { userTable: 'app_users', userIdColumn: 'id', userNameColumn: 'username' }
 * ```
 */
export type AuditInitConfigInput = z.input<typeof AuditInitConfigSchema> & {
  /** 开启备份时注入已初始化且私有访问的存储；audit 不拥有它的生命周期。 */
  storage?: StorageFunctions
  /** 开启告警时注入已初始化的 Reach；通知人员/目标仍由应用配置。 */
  reach?: ReachFunctions
}
