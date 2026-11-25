# @h-ai/audit 配置

<a id="audit-配置"></a>

[English](audit.en.md) · [日本語](audit.ja.md)

[配置手册](README.md) · [数据结构](../data/audit.md) · [功能说明](../function/audit.md)

## 配置入口

生成的项目在 `config/_audit.yml` 中设置审计。应用启动时从 `core.config.get('audit')` 读取这些设置并传给 `audit.init()`。用环境变量覆盖时使用 `HAI_AUDIT_` 前缀。修改后在下次成功初始化时生效。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

审计记录写进 RelDB。应用启动代码先调用 `reldb.init()`。启用备份时把已初始化的 `storage` 作为 `storage` 传给 `audit.init()`，启用告警时把已初始化的 `reach` 作为 `reach` 传进去。要定时执行，读取 `audit.schedulerPlan` 属性，并将计划中的任务和钩子交给 Scheduler。参见[定时计划接入示例](../function/audit.md#scheduled-audit)。

<a id="configuration-fields"></a>

## 配置清单

<a id="配置示例"></a>

<a id="生效与核对"></a>

下文的 YAML 片段写入 `config/_audit.yml` 并与其他分组合并。同一分组的不同示例按需选用。修改后重启服务，再按示例核对实际结果。示例中的账号、收件地址和业务字段均为自定义值。

<a id="audit-capture"></a>

### `capture`

应用初始化 Audit 后，接入审计的框架入口在操作完成时调用 `audit.capture()`，将操作类型和结果交给 Audit。常见入口如下。

- **IAM** 在登录、账号变更和授权等操作结束后记录结果。例如调用 `iam.auth.login()`，会尝试记录 `action: 'auth.login'`、`resource: 'iam.auth'`，密码登录的详情为 `method: 'password'`。
- **Kit** 通过 `kit.createHandle()` 处理 SvelteKit 请求，在响应返回前记录 `request.execute`。`resource` 是路由 ID，详情包含 HTTP 方法和状态码。
- **Serv** 在已接入的 procedure 返回时记录 `request.execute`。HTTP 校验或中间件提前拒绝请求时也能记录 `http.reject`。

Kit 和 Serv 将 `GET`、`HEAD` 和 `OPTIONS` 视为读取，默认跳过成功的读取，失败和拒绝仍会记录。对订单确认等业务动作，应用可调用 [`audit.log()`](../function/audit.md#events) 另写入具体动作、订单 ID 和状态变化。

| 配置项 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `capture` | 默认记录写操作、失败和拒绝 | 框架入口自动采集；显式 audit.log 不受此开关影响 |
| `capture.enabled` | `true` | 是否自动记录已接入框架入口的重要操作、失败和拒绝；关闭不阻止显式 audit.log 写入 |
| `capture.includeReads` | `false` | 是否也采集成功读取事件；开启可追溯查询行为，但会显著增加日志量与存储开销 |

<a id="示例记录订单修改和失败操作"></a>

#### 示例：记录管理后台的修改请求

重启后，在管理后台用有权限的测试账号修改一个测试用户。Kit 收到 `PUT /api/iam/users/[id]` 的成功响应时，会写入 `action: 'request.execute'`、`resource: '/api/iam/users/[id]'`、`outcome: 'success'`。可用 `audit.list({ action: 'request.execute', resource: '/api/iam/users/[id]' })` 查询。将结果里的 `details` 展开，可看到 `{ "method": "PUT", "status": 200 }`。若同一请求被权限检查以 403 拒绝，记录的 `outcome` 则为 `denied`。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

<a id="查询操作也留记录并隐藏客户手机号"></a>

#### 示例：追踪成功查询

重新启动管理后台后，用具备 `user:list` 权限的已登录测试会话直接请求 `GET /api/iam/users`。在 `audit.list({ action: 'request.execute', resource: '/api/iam/users' })` 中核对新增的成功事件，展开 `details` 可看到 `{ "method": "GET", "status": 200 }`。高频读取会增加日志量。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: true
```

#### 示例：仅记录业务显式提交的事件

重启后，在服务端直接调用 `iam.auth.login()` 执行一次测试登录，再调用 `audit.log()` 写入自定义业务事件。在 `audit.list()` 中可查到显式写入的事件，这次测试登录不会新增 IAM 的 `auth.login` 事件。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: false
```

<a id="audit-privacy"></a>

### `privacy`

在事件入库前遮盖 `details` 内的业务隐私字段，减少具有查询权限的人看到不必要的原始数据。认证凭据始终遮盖。

| 配置项 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `privacy` | 默认遮盖业务隐私字段 | 凭据始终脱敏；此开关仅控制业务隐私字段 |
| `privacy.enabled` | `true` | 是否对业务隐私字段脱敏；关闭也不会暴露密码、token 等凭据，脱敏前的内容不会恢复 |
| `privacy.fields` | `[]` | 额外脱敏的详情字段名，不区分大小写；例如 customerPhone，不要将秘密放进 action/resourceId。可填数组（元素为字符串，1–256 个字符），最多 1000 项 |

#### 示例：遮盖客户电话和配送备注

订单服务在更新配送信息后调用 `audit.log()`。传入的 `details` 是这次操作需要留档的数据。电话字段名已命中默认遮盖规则，`deliveryNote` 是通过下面的配置额外遮盖的项目字段。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  fields: [customerPhone, deliveryNote]
```

用上面的配置启动测试服务，再写入一条模拟订单事件，按请求编号查出刚保存的记录。

```ts
import { audit } from '@h-ai/audit'

// 保存订单配送状态和两项模拟详情。两个隐私值会在入库前替换。
const written = await audit.log({
  action: 'delivery.update',
  resource: 'orders',
  resourceId: 'order-42',
  requestId: 'demo-order-privacy',
  details: {
    customerPhone: '000-0000-0000',
    deliveryNote: 'Leave at reception',
    status: 'shipped',
  },
})
if (!written.success) throw new Error(written.error.message)

// 按示例请求编号筛选，并用事件 ID 找到此次写入的记录。
const listed = await audit.list({ requestId: 'demo-order-privacy' })
if (!listed.success) throw new Error(listed.error.message)
const event = listed.data.items.find(item => item.id === written.data.id)
if (!event?.details) throw new Error('指定的审计事件没有返回详情')
const details = JSON.parse(event.details)
```

`event.details` 是查询返回的 JSON 字符串。解析后可看到实际保存的三个字段。

```json
{
  "customerPhone": "[REDACTED]",
  "deliveryNote": "[REDACTED]",
  "status": "shipped"
}
```

#### 示例：测试环境关闭业务隐私遮盖

在无真实客户数据的测试环境中写一条包含虚构邮箱和测试令牌的事件。采集不受此开关控制。查询该事件时，邮箱保持可见，令牌仍会遮盖。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  enabled: false
```

<a id="audit-user-mapping"></a>

<a id="usertable"></a>

<a id="useridcolumn"></a>

<a id="usernamecolumn"></a>

### 用户字段映射

按事件的 `userId` 查询用户名称，并把名称复制到事件的身份快照中。默认使用 IAM 用户表。名称查找使用已配置的表与列。调用方应传入可信的用户 ID，已保存名称不会随用户改名变化。

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `userTable` | `"hai_iam_users"` | 用于查找操作者名称的用户表。 |
| `userIdColumn` | `"id"` | 与事件 `userId` 匹配的用户 ID 列。 |
| `userNameColumn` | `"username"` | 复制到事件身份快照的用户名称列。 |

#### 示例：从应用自己的账号表读取名称

订单服务使用 `app_users` 存账号，主键为 `account_id`，名称列为 `display_name`。在同一数据库准备测试账号后，用其 ID 写入事件且省略 `actorSnapshot`。通过 `audit.list()` 核对事件带有该账号当时的名称。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
userTable: app_users
userIdColumn: account_id
userNameColumn: display_name
```

<a id="audit-retention"></a>

### `retention`

为近期审计事件设置最低保护期。启用后，数据库触发器阻止保护期内的修改、删除和覆盖，`audit.cleanup()` 也遵守这个期限。记录达到最低期限后，清理仍由应用另行安排。共用数据库的实例使用相同的留存配置，修改后统一重启。

| 配置项 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `retention` | 可省略 | 省略或使用 `{}` 时应用本页的字段默认值。 |
| `retention.enabled` | `false` | 为保护期内的记录启用数据库修改、删除和覆盖保护。 |
| `retention.minDays` | `90` | 最低保护天数，整数 1–36500，每天按 24 小时计算。仅在 `enabled: true` 时作为清理的最低天数。 |

<a id="保护最近-90-天的审计记录"></a>

#### 示例：保护最近 90 天的审计记录

启用 90 天保护后，用测试库核对 `audit.cleanup(0)` 的删除数。最近 90 天的记录保持不变。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 90
```

<a id="change-retention"></a>

<a id="将已启用的保护期延长至-120-天"></a>

#### 示例：将已启用的保护期延长至 120 天

保留 `enabled: true`，将 `minDays` 从 90 改为 120。统一重启后，测试库中的 `audit.cleanup(0)` 只会删除早于 120 天的记录。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 120
```

#### 示例：解除测试库的保留保护

在专用测试库设置 `enabled: false`。重启后，`audit.cleanup(30)` 按传入的 30 天执行；省略参数时仍使用接口默认的 90 天。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: false
```

<a id="audit-backup"></a>

### `backup`

将一段审计记录另存到私有对象存储，供授权人员核对或离线分析。启用后应在初始化 Audit 时传入已连接的私有 Storage。

| 配置项 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `backup` | 默认不备份 | 导出历史审计日志。应用可将备份任务注册到已有的 Scheduler 以定时执行 |
| `backup.enabled` | `false` | 是否允许手动/计划归档审计；需已初始化的私有 Storage，关闭不影响审计采集 |
| `backup.batchSize` | `200` | 每批读取的记录数；较小更省内存但请求更多，不改变归档内容。可填整数，1–1000 |
| `backup.maxRecordBytes` | `1048576` | 单条归档记录的 UTF-8 字节上限。可填整数，1024–67108864 |
| `backup.schedule` | 默认不自动备份 | 自动备份计划；与手动备份开关独立，备份不会删除源日志，也不是原子数据库快照 |
| `backup.schedule.enabled` | `false` | 是否由 Scheduler 自动备份；还需 backup.enabled=true，关闭后仍可手动备份 |
| `backup.schedule.cron` | `"0 2 * * *"` | 五字段 Cron，`0 2 * * *` 表示在所选时区每天 02:00 执行。可填字符串，1–128 个字符 |
| `backup.schedule.timezone` | `"UTC"` | 定时备份采用的 IANA 时区；Asia/Shanghai 为北京时间，UTC 的 02:00 对应北京时间 10:00。可填字符串，1–128 个字符 |

#### 示例：按需归档一次事件调查的记录

调查开始时只启用备份。按调查时间范围调用 [`audit.backup.run()`](../function/audit.md#backups)，记下成功结果的 `key`，再用 `audit.backup.verify(key)` 核对条数和校验和。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
```

#### 示例：每天凌晨 2 点在私有存储归档

将 Audit 的计划注册到 Scheduler 后，每天北京时间 02:00 创建归档。每批读取 100 条，单条记录最多 2 MiB。重启后在调度执行记录中核对计划成功，再验证生成的私有对象。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
  batchSize: 100
  maxRecordBytes: 2097152
  schedule:
    enabled: true
    cron: '0 2 * * *'
    timezone: Asia/Shanghai
```

<a id="audit-alerts"></a>

### `alerts`

按规则统计已提交的审计事件，达到阈值时通过 Reach 通知指定人员。每个窗口统计匹配的全部事件。手动检查只需要 Reach，自动检查还需要把任务和钩子注册到 Scheduler。

| 配置项 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `alerts` | 默认关闭告警 | 以固定时间窗口统计已提交事件；目标和事件由应用配置，不内置业务角色 |
| `alerts.enabled` | `false` | 是否检查异常事件并发送告警；开启前配置至少一条规则和真实 Reach 通道，关闭不影响审计入库 |
| `alerts.maxNotificationsPerCheck` | `100` | 每次检查最多尝试的通知数；超过的目标留待后续检查，避免突发告警挤占业务资源。可填整数，1–1000 |
| `alerts.rules` | `[]` | 告警规则列表；每条按全站匹配事件的固定窗口累计计数，不是每个账号各自计数。可填数组，最多 20 项 |
| `alerts.rules[].id` | 必填 | 规则唯一标识，用于追踪告警状态 |
| `alerts.rules[].actions` | 必填 | 匹配的审计 action 全名，例如 auth.login；从实际记录复制，不支持 auth.* 通配。可填数组（元素为字符串，1–128 个字符），至少 1 项、最多 50 项 |
| `alerts.rules[].resource` | 可省略 | 只统计此资源类型的事件；省略时不按资源过滤，不填写业务敏感正文。可填字符串，1–256 个字符 |
| `alerts.rules[].outcomes` | `["failure", "denied"]` | 要统计的执行结果。可填数组（元素为 `"success"`、`"failure"`、`"denied"`），最多 3 项 |
| `alerts.rules[].minimumSeverity` | `"info"` | 参与计数的事件最低等级；低于此级别的记录仍保留，但不触发这条告警。可填 `"info"`、`"warning"`、`"error"`、`"critical"` |
| `alerts.rules[].severity` | `"warning"` | 发出通知时的告警等级；不修改原始审计事件的等级。可填 `"warning"`、`"error"`、`"critical"` |
| `alerts.rules[].threshold` | `1` | 同一窗口内累计达到此次数才通知；与 IAM 登录失败锁定阈值分别配置。可填整数，1–1000000000 |
| `alerts.rules[].windowSeconds` | `300` | 固定计数窗口长度，单位秒；例如 300 表示按五分钟窗口统计，不追补长期停机历史。可填整数，60–86400 |
| `alerts.rules[].targets` | 必填 | 通知接收目标；每个目标独立记录投递结果，渠道受理不等于人员已读。可填数组，至少 1 项、最多 20 项 |
| `alerts.rules[].targets[].id` | 必填 | 规则内的目标唯一标识，系统按目标分别跟踪投递 |
| `alerts.rules[].targets[].provider` | 必填 | 已注册的 Reach Provider 名称，例如 email；不是 smtp/api 等 Provider 类型。可填字符串，1–128 个字符 |
| `alerts.rules[].targets[].to` | 必填 | 该通道接受的收件地址，例如邮箱或手机号；填写真实值，开发 Console 不会投递。可填字符串，1–1000 个字符 |
| `alerts.schedule` | 默认不自动检查 | 告警检查时间。将 `audit.schedulerPlan` 中的告警任务和钩子注册到 Scheduler 后，才会按计划检查 |
| `alerts.schedule.enabled` | `false` | 是否让 Scheduler 自动检查；需同时开启 alerts.enabled，否则仅保留计划配置 |
| `alerts.schedule.cron` | `"* * * * *"` | 检查频率的 Cron 表达式。可填字符串，1–128 个字符 |
| `alerts.schedule.timezone` | `"UTC"` | Cron 使用的 IANA 时区，例如 Asia/Shanghai；UTC 不等于北京时间。可填字符串，1–128 个字符 |

#### 示例：手动检查登录失败或拒绝

在 Reach 注册名为 `email` 的通道，并把示例邮箱替换为测试收件地址。让同一 5 分钟窗口内出现 3 条 `auth.login` 失败或拒绝事件，再调用 [`audit.checkAlerts()`](../function/audit.md#alerts)，核对报告中的 `submitted` 或 `queued` 数量。未配置定时任务时可按需触发检查。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  rules:
    - id: login-failures
      actions: [auth.login]
      resource: iam.auth
      outcomes: [failure, denied]
      threshold: 3
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
```

#### 示例：自动通知管理员角色分配

该示例在一次成功的 IAM 角色分配后通知管理员。将示例邮箱换为接收通知的地址，在 Reach 注册名为 `email` 的通道，并注册 Audit 的调度计划。分配一次角色后，查看下一次告警检查及 Reach 通道的处理结果。每分钟检查一次，每次最多尝试 20 条通知。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  maxNotificationsPerCheck: 20
  rules:
    - id: role-assignment
      actions: [role.assign]
      resource: iam.user-roles
      outcomes: [success]
      threshold: 1
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
  schedule:
    enabled: true
    cron: '* * * * *'
    timezone: UTC
```

同时配置多个服务的部署示例见[反馈、通知、审计与任务](operations.md#audit采集保留保护归档与告警)。
