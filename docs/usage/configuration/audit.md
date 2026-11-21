# Audit 配置

[English](audit.en.md) · [日本語](audit.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目在 `config/_audit.yml` 中设置审计。应用启动时从 `core.config.get('audit')` 读取这些设置并传给 `audit.init()`。用环境变量覆盖时使用 `HAI_AUDIT_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

审计记录写进 RelDB。应用启动代码先调用 `reldb.init()`。启用备份时把已初始化的 `storage` 作为 `storage` 传给 `audit.init()`，启用告警时把已初始化的 `reach` 作为 `reach` 传进去。要定时执行，应用还需把 `audit.schedulerPlan()` 给出的任务交给 Scheduler。

## 配置示例

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

### 保护最近 90 天的审计记录

写入 `config/_audit.yml`。这会阻止保护期内的记录被修改或删除，不会在第 91 天自动删除。清理仍由应用另行安排；去掉这一段也不会解除已保存到共享数据库的保护设置。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
retention:
  enabled: true
  minDays: 90
```

### 查询操作也留记录，并隐藏客户手机号

开启 `includeReads` 后，已经接入审计采集的成功查询也会留下记录，日志量会增加。`customerPhone` 是业务详情中的字段名，写入时隐藏；密码和令牌始终由模块隐藏，不依赖这个列表。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: true
privacy:
  enabled: true
  fields: [customerPhone]
```

<a id="configuration-fields"></a>

## 配置清单

省略 `alerts.schedule` 时，告警检查不会自动运行。要定时检查，设置 `alerts.schedule.enabled: true`，再把对应任务注册到 Scheduler。未开启自动检查时，应用仍可用 `audit.checkAlerts()` 手动运行。

### `alerts`

| 配置项                              | 默认值/必填             | 说明                                                                                                                                       |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `alerts`                            | 默认关闭告警            | 以固定时间窗口统计已提交事件；目标和事件由应用配置，不内置业务角色                                                                         |
| `alerts.enabled`                    | `false`                 | 是否检查异常事件并发送告警；开启前配置至少一条规则和真实 Reach 通道，关闭不影响审计入库                                                    |
| `alerts.maxNotificationsPerCheck`   | `100`                   | 每次检查最多尝试的通知数；超过的目标留待后续检查，避免突发告警挤占业务资源。可填整数，1–1000                                               |
| `alerts.rules`                      | `[]`                    | 告警规则列表；每条按全站匹配事件的固定窗口累计计数，不是每个账号各自计数。可填数组，最多 20 项                                             |
| `alerts.rules[].id`                 | 必填                    | 规则唯一标识，用于追踪告警状态                                                                                                             |
| `alerts.rules[].actions`            | 必填                    | 匹配的审计 action 全名，例如 auth.login；从实际记录复制，不支持 auth.* 通配。可填数组（元素为字符串，1–128 个字符），至少 1 项、最多 50 项 |
| `alerts.rules[].resource`           | 可省略                  | 只统计此资源类型的事件；省略时不按资源过滤，不填写业务敏感正文。可填字符串，1–256 个字符                                                   |
| `alerts.rules[].outcomes`           | `["failure", "denied"]` | 要统计的执行结果。可填数组（元素为 `"success"`、`"failure"`、`"denied"`），最多 3 项                                                       |
| `alerts.rules[].minimumSeverity`    | `"info"`                | 参与计数的事件最低等级；低于此级别的记录仍保留，但不触发这条告警。可填 `"info"`、`"warning"`、`"error"`、`"critical"`                      |
| `alerts.rules[].severity`           | `"warning"`             | 发出通知时的告警等级；不修改原始审计事件的等级。可填 `"warning"`、`"error"`、`"critical"`                                                  |
| `alerts.rules[].threshold`          | `1`                     | 同一窗口内累计达到此次数才通知；与 IAM 登录失败锁定阈值分别配置。可填整数，1–1000000000                                                    |
| `alerts.rules[].windowSeconds`      | `300`                   | 固定计数窗口长度，单位秒；例如 300 表示按五分钟窗口统计，不追补长期停机历史。可填整数，60–86400                                            |
| `alerts.rules[].targets`            | 必填                    | 通知接收目标；每个目标独立记录投递结果，渠道受理不等于人员已读。可填数组，至少 1 项、最多 20 项                                            |
| `alerts.rules[].targets[].id`       | 必填                    | 规则内的目标唯一标识，系统按目标分别跟踪投递                                                                                               |
| `alerts.rules[].targets[].provider` | 必填                    | 已注册的 Reach Provider 名称，例如 email；不是 smtp/api 等 Provider 类型。可填字符串，1–128 个字符                                         |
| `alerts.rules[].targets[].to`       | 必填                    | 该通道接受的收件地址，例如邮箱或手机号；填写真实值，开发 Console 不会投递。可填字符串，1–1000 个字符                                       |
| `alerts.schedule`                   | 默认不自动检查          | 告警检查时间。应用将 `audit.schedulerPlan()` 返回的任务注册到 Scheduler 后，才会按计划检查                                                 |
| `alerts.schedule.enabled`           | `false`                 | 是否让 Scheduler 自动检查；需同时开启 alerts.enabled，否则仅保留计划配置                                                                   |
| `alerts.schedule.cron`              | `"* * * * *"`           | 检查频率的 Cron 表达式。可填字符串，1–128 个字符                                                                                           |
| `alerts.schedule.timezone`          | `"UTC"`                 | Cron 使用的 IANA 时区，例如 Asia/Shanghai；UTC 不等于北京时间。可填字符串，1–128 个字符                                                    |

### `backup`

| 配置项                     | 默认值/必填    | 说明                                                                                                          |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `backup`                   | 默认不备份     | 导出历史审计日志。应用可将备份任务注册到已有的 Scheduler 以定时执行                                           |
| `backup.enabled`           | `false`        | 是否允许手动/计划归档审计；需已初始化的私有 Storage，关闭不影响审计采集                                       |
| `backup.batchSize`         | `200`          | 每批读取的记录数；较小更省内存但请求更多，不改变归档内容。可填整数，1–1000                                    |
| `backup.maxRecordBytes`    | `1048576`      | 单条归档记录的 UTF-8 字节上限。可填整数，1024–67108864                                                        |
| `backup.schedule`          | 默认不自动备份 | 自动备份计划；与手动备份开关独立，备份不会删除源日志，也不是原子数据库快照                                    |
| `backup.schedule.enabled`  | `false`        | 是否由 Scheduler 自动备份；还需 backup.enabled=true，关闭后仍可手动备份                                       |
| `backup.schedule.cron`     | `"0 2 * * *"`  | 备份 Cron 表达式；0 2 ** * 表示在下方时区每天 02:00 执行。可填字符串，1–128 个字符                            |
| `backup.schedule.timezone` | `"UTC"`        | 定时备份采用的 IANA 时区；Asia/Shanghai 为北京时间，UTC 的 02:00 对应北京时间 10:00。可填字符串，1–128 个字符 |

### `capture`

| 配置项                 | 默认值/必填                | 说明                                                                            |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `capture`              | 默认记录写操作、失败和拒绝 | 框架入口自动采集；显式 audit.log 不受此开关影响                                 |
| `capture.enabled`      | `true`                     | 是否自动记录已接入框架入口的重要操作、失败和拒绝；关闭不阻止显式 audit.log 写入 |
| `capture.includeReads` | `false`                    | 是否也采集成功读取事件；开启可追溯查询行为，但会显著增加日志量与存储开销        |

### `retention`

| 配置项              | 默认值/必填 | 说明                                                                                    |
| ------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `retention`         | 可省略      | 未传时沿用数据库保留设置；显式关闭才解除保护                                            |
| `retention.enabled` | `false`     | 是否启用共享数据库的审计修改/删除/覆盖保护；配置会持久化，移除配置不会解除已有保护      |
| `retention.minDays` | `90`        | 保护期天数；例如 90 天内 cleanup(0) 也不能删除，到期不会自动清理日志。可填整数，1–36500 |

### `privacy`

| 配置项            | 默认值/必填          | 说明                                                                                                                                           |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `privacy`         | 默认遮盖业务隐私字段 | 凭据始终脱敏；此开关仅控制业务隐私字段                                                                                                         |
| `privacy.enabled` | `true`               | 是否对业务隐私字段脱敏；关闭也不会暴露密码、token 等凭据，脱敏前的内容不会恢复                                                                 |
| `privacy.fields`  | `[]`                 | 额外脱敏的详情字段名，不区分大小写；例如 customerPhone，不要将秘密放进 action/resourceId。可填数组（元素为字符串，1–256 个字符），最多 1000 项 |

### `userTable`

| 配置项      | 默认值/必填       | 说明                               |
| ----------- | ----------------- | ---------------------------------- |
| `userTable` | `"hai_iam_users"` | 事件写入时用于捕获用户名的用户表名 |

### `userIdColumn`

| 配置项         | 默认值/必填 | 说明                               |
| -------------- | ----------- | ---------------------------------- |
| `userIdColumn` | `"id"`      | 用于查找事件操作者的用户表主键列名 |

### `userNameColumn`

| 配置项           | 默认值/必填  | 说明                         |
| ---------------- | ------------ | ---------------------------- |
| `userNameColumn` | `"username"` | 用于写入身份快照的用户名列名 |

## 生效与核对

先执行一次已接入审核的写操作，再用 `audit.list()` 确认出现新记录。开启成功读取采集后，查询操作也会写记录。开启保护期后，保护期内的记录不会被清理。定时设置中的 `enabled` 只决定 Scheduler 是否自动执行告警检查或备份。部署示例见[反馈、通知、审计与任务](operations.md#audit采集保留保护归档与告警)。
