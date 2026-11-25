---
name: hai-audit
description: "接入 @h-ai/audit 记录和查询业务操作，配置保留、归档和分级告警。"
---

# hai-audit

## 能力契约

| 项目     | 契约                                                       |
| -------- | ---------------------------------------------------------- |
| 能力     | 使用 @h-ai/audit 记录、查询、统计和清理操作审计            |
| 适用场景 | 业务操作留痕与审计记录检索                                 |
| 输入     | AuditInitConfigInput、已初始化 reldb、审计事件与查询条件   |
| 输出     | 记录/查询/统计的 HaiResult                                 |
| 限制     | 仅服务端；审计内容需脱敏，保留开关和天数由可信配置决定；启用后的最低保留不能通过清理参数绕过。 |

## 使用路径

1. 先初始化 RelDB，再使用 `AuditInitConfigInput` 初始化 Audit。`audit.init()` 等表结构就绪才成功。每步失败应停止后续操作。
2. 在实际业务成功/失败边界记录事件，明确审计失败如何影响业务，不重复记录同一事件。
3. 查询使用返回的分页元数据；清理前核对保留期及授权范围。凭据始终隐藏，业务隐私默认隐藏，可配置开关和字段名；自由文本需项目指定整个字段隐藏。
   SQLite/PostgreSQL/MySQL 的审计表以 Unix 毫秒存储事件时间，均返回 `createdAt: Date`、`details: string | null`。在 HTTP 边界按接口契约序列化日期；清理和相对统计使用数据库执行时钟。
4. 检查写入、查询和清理的 HaiResult，先关闭 audit 再关闭数据库。

事件字段支持 category（system/business）、outcome（success/failure/denied）、severity、requestId/traceId/scopeId 和 actorSnapshot。可信 HTTP 宿主使用 `audit.withContext({actor,requestId,ipAddress,userAgent}, operation)` 传播事件时身份；不能从未经验证的请求体读取 actor。身份/角色在写入时复制，历史未知值保持 null。`getStats(7,{category:'system'})` 支持分类统计，list 支持分类/结果/等级过滤与受控排序。

`capture:{enabled:true,includeReads:false}` 控制框架自动事件：IAM 关键变更及鉴别失败、Serv/Kit 写请求与失败/拒绝。可信入口自动绑定身份、地址和请求关联；业务语义仍须显式 audit.log。成功读取可选，关闭 capture 不影响显式 log。先初始化 audit 再初始化 IAM，关闭反序。任务/CLI 应通过 withContext 提供可信操作身份。

`audit.log(input,tx)`、`audit.capture(input,{tx})` 可使用调用者现有 RelDB 事务，事件和变更一并提交或回滚；失败尝试须在回滚后由入口记录。自动记录失败输出诊断并保留已生效业务结果；强制审计的业务检查同事务显式 log 的 HaiResult 后再提交。list 支持 requestId/traceId 关联筛选。

`retention: { enabled: true, minDays: 90 }` 启用共享最低保留，`cleanup(0)` 也须遵守。策略来自 `_audit.yml`，默认关闭，启用时默认保留 90 天。延长至 120 天时配置 `{ enabled: true, minDays: 120 }`。同库实例使用相同配置并在变更后协调重启。用户名取自事件时的快照，缺失时保留 ID。`audit.close()` 取消未完成的初始化并等待在途操作排空，再由宿主关闭数据库。

常见事件使用 `audit.helper` 与公开 `AuditHelper` 类型；内部记录器装配工厂不从包入口导出。

`backup.enabled` 默认关闭；开启后注入已初始化的私有 StorageFunctions。`backup.run({ id?, from?, to?, signal? })` 在调用时复制起止日期，并流式条件创建 JSONL，返回记录数、SHA-256 和截止时间。稳定 ID 只复用完整且条件相同的归档。`backup.verify(key)` 有界核对，`batchSize` 和 `maxRecordBytes` 控制内存。归档键以 `hai-private/audit-backups/` 开头，已有文件继续保持私有。已配置公开 `publicUrl` 的 S3 不能启用备份。

backup.schedule 配置开关、五字段 cron、IANA timezone；audit.schedulerPlan 返回供宿主显式合并到 scheduler.init 的 tasks/hooks，没有自动任务时为 null。回调复用共享 occurrenceId/取消信号，失败抛错让 Scheduler 正确失败。关闭 Scheduler 后再关闭 IAM/Audit/Storage/RelDB，audit 只取消/排空自己的备份。配置计划不隐式启动模块，也不劫持已有全局 hooks。

归档 v1 为 header、entry.record、footer；日期 ISO、保留历史 nullable 身份，SHA-256 覆盖 footer 前全部 UTF-8 行和换行。它是固定截止/主键游标的在线归档，严格同一时点恢复需停写/停清理或数据库快照。核对后离线读取或恢复至独立查询存储，不覆盖受保护在线记录；checksum 不等于来源真实性。

## 分级告警

审计 createdAt、归档截止与窗口以数据库时钟为准；Scheduler 计划中的任务依赖稳定归档 ID/共享通知领取声明幂等，失败不能误锁后续检查。

`alerts` 默认关闭。启用时注入已初始化的 Reach，配置规则和目标。`audit.checkAlerts({ signal? })` 统计当前和前一固定窗口内已提交的事件。共享 DB 锁定领取后按执行时钟校验期限，提交发送状态后确认未取消才调用 Reach。默认每轮最多尝试 100 次，`more` 提示后续检查。`submitted` 是通道受理，`queued` 是 Reach 持久入队。只有窗口开始超过 72 小时的 `submitted` 和 `queued` 会被清理。保留 `unknown`、`sending`、`claimed` 供人工核验外部效果，具体处理见[分级告警参考](reference.md#分级告警)。

alerts.schedule 控制定时开关/cron/timezone；audit.schedulerPlan 统一备份和告警计划，没有自动任务时才为 null。宿主显式装配 Scheduler，失败或 report.failed>0 必须失败；先关闭 Scheduler，再关闭 Audit/Reach，Audit 排空自有操作但不关闭 Reach。业务返回 HaiResult 失败须检查；成功检查报告仍须查看 failed。规则无需引入通用策略引擎。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [依赖](reference.md#依赖)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [错误码](reference.md#错误码)
- [常见模式](reference.md#常见模式)
- [相关 Skills](reference.md#相关-skills)
