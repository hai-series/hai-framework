# @h-ai/feedback 配置

[English](feedback.en.md) · [日本語](feedback.ja.md) · [功能说明](../function/feedback.md) · [数据结构](../data/feedback.md)

## 配置入口

在应用的服务端配置目录放置 `config/_feedback.yml`。管理台启动时由 Core 读取文件并用 `FeedbackConfigSchema` 校验。独立集成应先连接 RelDB，再调用 `feedback.init(config)`。初始化成功后，API 才能提交和读取反馈。修改应用标识、发送上限、采集或保留期限后需要重启 Feedback 服务实例。

<a id="configuration-fields"></a>

## 配置清单

| 字段 | 环境变量 | 类型和范围 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | 字符串，去掉首尾空白后长度为 1 至 128，不含 NUL | 是 | 无 | 随首帖写入 `app_id`，列表、详情、消息和附件的读取都限定在这个应用。 |

共用关系库的多个应用应使用各自的 `appId`。同一应用的多个实例如果共用数据库，应使用相同的值。例：`orders` 和 `inventory` 可共用一套数据库表，两边的反馈列表各自独立。把 `orders` 改成 `orders-v2` 后，新实例查询的是新标识，原记录仍属于 `orders`。

### 发送上限

以下字段可省略，首帖、回复和补充请求使用同一组上限。文件容量按 Base64 编码前的原始字节计算。

| 字段 | 环境变量 | 默认值 | 范围与用途 |
| --- | --- | --- | --- |
| `limits.maxBodyLength` | `HAI_FEEDBACK_LIMITS_MAXBODYLENGTH` | 5000 | 1–20000 个 UTF-16 代码单元。 |
| `limits.maxFiles` | `HAI_FEEDBACK_LIMITS_MAXFILES` | 5 | 1–20 个手动附件。 |
| `limits.maxFileBytes` | `HAI_FEEDBACK_LIMITS_MAXFILEBYTES` | 5242880（5 MiB） | 1–10485760 字节。单个手动附件或首帖材料上限。 |
| `limits.maxTotalFileBytes` | `HAI_FEEDBACK_LIMITS_MAXTOTALFILEBYTES` | 10485760（10 MiB） | 1–25165824 字节，且不小于单文件上限。手动附件和首帖现场共用。 |

### 首帖现场

以下字段可省略。日志及回放的文件还受单文件上限和发送剩余容量约束。录屏时长在浏览器控制，服务端对收到的录屏校验文件容量及类型。

| 字段 | 环境变量 | 默认值 | 范围与用途 |
| --- | --- | --- | --- |
| `capture.windowSeconds` | `HAI_FEEDBACK_CAPTURE_WINDOWSECONDS` | 300 | 1–1800 秒。浏览器日志、回放和服务端日志的回看窗口。 |
| `capture.maxLogEntries` | `HAI_FEEDBACK_CAPTURE_MAXLOGENTRIES` | 1000 | 1–5000 条。每份浏览器或服务端日志的条数上限。 |
| `capture.maxLogBytes` | `HAI_FEEDBACK_CAPTURE_MAXLOGBYTES` | 524288 | 1–2097152 字节。每份日志的字节上限。 |
| `capture.maxReplayBytes` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYBYTES` | 2097152 | 1–8388608 字节。页面回放的字节上限。 |
| `capture.maxReplayEvents` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYEVENTS` | 2000 | 1–10000 个页面回放事件。 |
| `capture.maxRecordingSeconds` | `HAI_FEEDBACK_CAPTURE_MAXRECORDINGSECONDS` | 60 | 1–300 秒。上限到达或文件接近容量上限时停止录屏。 |

### 保留期限

| 字段 | 环境变量 | 默认值 | 范围与用途 |
| --- | --- | --- | --- |
| `retention.days` | `HAI_FEEDBACK_RETENTION_DAYS` | 0 | 0–3650 的整数。0 表示长期保留；正数表示从最近一次消息或状态变更起保留的天数。首帖刚提交时从提交时间起算。 |

到期后，任何状态的反馈都无法通过列表或详情读取。服务启动时及每小时按应用分批清理到期反馈，消息和附件随反馈一起删除。同一应用的多个实例应使用相同的设置。重启后，新设置会作用于既有记录。 [数据保留](../data/feedback.md#retention)

<a id="configuration-ownership"></a>

## 宿主接入

应用通过以下入口连接数据库、解析权限和业务范围，并配置文件传输。

| 层级 | 在哪里设置 | 何时生效 |
| --- | --- | --- |
| 数据库 | 宿主传给 `reldb.init` 的连接配置，管理台从 `config/_db.yml` 读取 | Feedback 启动后用宿主选定的 SQLite、PostgreSQL 或 MySQL 保存三张表。 |
| 身份与业务范围 | 宿主在 `resolveContext` 中从可信会话提供 `userId`、`scopeId` 和权限。需要关联 Core 日志时，业务请求的 Core 上下文也要写入同一范围。 | 每次 API 请求按当前会话和范围鉴权。角色可由宿主调配。 |
| 浏览器现场 | 宿主给登录后的 `FeedbackModal` 传入 `captureKey`。用户在首帖弹窗里查看、删除材料，授权录屏或勾选服务端日志。 | 组件挂载后开始在本页缓冲，打开弹窗时冻结部分材料。用户的选择对本次提交生效。 |
| HTTP 传输 | Kit 的 `_kit.yml` 或 Serv 的 `_serv.yml` 管理 `transport`，在加密传输开启时通过 `transport.routePlaintextBytes` 声明大文件路由容量。 | 宿主处理 HTTP 请求和响应时检查路径容量。 |
| 保留期限 | `_feedback.yml` 的 `retention.days` | 到期后停止显示，并由服务分批清理。 |

[RelDB 配置](reldb.md) · [权限及首帖现场](../function/feedback.md#permissions) · [数据保留](../data/feedback.md#retention)

## 配置示例

### 固定应用标识

把下面内容放在订单应用的 `config/_feedback.yml`，并先启动数据库连接。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```

启动后提交一条反馈。可以在对应库的 `hai_feedback_reports.app_id` 看到 `orders`，随后在这个应用的「我的反馈」里打开该记录。管理台用同一方式配置 `appId: admin-console`。

### 按部署环境替换标识

Core 加载名为 `feedback` 的配置时，`HAI_FEEDBACK_APPID` 优先于文件里的 `appId`，包括上一例的字面值。给另一套部署设置 `HAI_FEEDBACK_APPID=orders-staging` 后重启，再提交的反馈属于 `orders-staging`。

CLI 模板也会在文件里写出环境变量占位，使用生成项目名作为回退值。订单应用的模板示例如下。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: ${HAI_FEEDBACK_APPID:orders}
```

变量未设置时，本例使用 `orders`。这是文件中的回退值，`appId` 本身没有默认值。 [Core 环境配置](core.md)

### 调整容量和保留天数

例如，订单应用允许单次发送 12 MiB，并从最后一次活动起保留反馈 90 天。配置各项可独立省略，沿用对应默认值。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
limits:
  maxFileBytes: 6291456
  maxTotalFileBytes: 12582912
capture:
  windowSeconds: 180
  maxRecordingSeconds: 45
retention:
  days: 90
```

修改配置后重启承载 Feedback 的服务并刷新页面。宿主可从已登录的 `GET /feedback/limits` 读取 `limits` 和 `capture`，用于首帖和对话界面。缩小限额后，已有反馈在保留期内仍可查看，新的发送按新限额校验。

<a id="transport-budget"></a>

### 大文件路由的明文容量

当宿主开启加密传输时，将 `apiContract.feedbackTransportRoutes(apiPrefix, maxTotalFileBytes)` 合并进 `transport.routePlaintextBytes`。`apiPrefix` 要传真实挂载路径，例如 Kit 的 `/api`，部署在 `/console` 下则传 `/console/api`。以 `/api` 为例，默认配置生成以下规则，值为 16 MiB。调大单次合计容量会提高提交和消息路径的预算。附件读取路径保留 16 MiB，以支持以往保存的文件。

| 路径 | 涉及的内容 |
| --- | --- |
| `/api/feedback/reports` | 发送首帖及其材料。 |
| `/api/feedback/reports/*/messages` | 发送回复或补充请求及其附件。 |
| `/api/feedback/reports/*/attachments/*` | 读取一个附件的 Base64 内容。 |

10 MiB 原始文件经过 Base64 编码约为 13.33 MiB，另有 JSON 和传输包的开销。调用时传入生效的 `limits.maxTotalFileBytes`，让明文预算覆盖序列化内容。单次文件上限仍按原始字节计算。反向代理或托管平台若有独立请求大小限制，也要允许实际编码后的请求通过。管理台加载配置时先合并反馈路径默认值，接着应用宿主显式配置的路径值。

[Kit 传输配置](kit.md) · [Serv 传输配置](serv.md) · [反馈运维](../operations/feedback.md)
