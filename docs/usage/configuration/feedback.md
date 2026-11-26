# @h-ai/feedback 配置

<a id="feedback-配置"></a>

[English](feedback.en.md) · [日本語](feedback.ja.md)

[配置手册](README.md) · [数据结构](../data/feedback.md) · [功能说明](../function/feedback.md)

## 配置入口

应用启动时从 `config/_feedback.yml` 读取配置，传给 `feedback.init(config, options)`。修改配置后重新启动应用。环境变量按字段路径覆盖，例如 `notification.mode` 对应 `HAI_FEEDBACK_NOTIFICATION_MODE`，`limits.maxTotalBytes` 对应 `HAI_FEEDBACK_LIMITS_MAXTOTALBYTES`。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

<a id="configuration-fields"></a>

## 配置清单

### 基础接入

生成工程显式选择 `console`。启动后提交一条反馈，在服务端日志中用反馈编号确认 Console 通知。

| 路径 | 默认值与约束 | 用途 |
| --- | --- | --- |
| `appId` | 必填，1–128 字符 | 与浏览器及 API 的应用 ID 一致。 |
| `notification.mode` | `reach`，可选 `disabled`、`console`、`reach` | 分别关闭反馈通知、输出服务端日志、通过 Reach 投递。 |
| `retention.days` | 30，1–3650 天 | 报告到期后停止访问和导出。后台清理证据与对象。 |

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: console
```

### 按需能力

| 路径 | 默认值与约束 | 用途 |
| --- | --- | --- |
| `notification.consoleContent` | `metadata`，或 `summary` | Console 记录定位元数据，选 `summary` 时加入经过脱敏的摘要。 |
| `notification.recipients` | `[]`，最多 20 项，每项 1–320 字符 | Reach 模式至少填一项，由实际渠道校验目的地。 |
| `notification.provider` | `email`，非空字符串 | 已初始化的 Reach 渠道名称。 |
| `notification.adminUrl` | 可省略，HTTP(S) URL | 通知和 Webhook 使用的管理页链接。 |
| `webhook.url` | 空字符串，最多 2048 字符 | 配置可信 HTTP(S) 接收端后启用 Webhook，禁止 URL 凭据和片段。 |
| `webhook.secret` | 空字符串，最多 4096 字符 | 配置后对回调签名，通过服务端私有变量 `HAI_FEEDBACK_WEBHOOK_SECRET` 注入。 |
| `collection.envAllowlist` | `[]`，最多 100 项，每项 1–128 字符 | 允许采集的服务端环境变量名。敏感名称仍会被过滤。 |
| `build.appVersion`、`build.buildId`、`build.commit` | 可省略，每项最多 128 字符 | 报告的应用版本、构建标识和源码提交，生成工程从实际产物注入。 |

向值班团队发邮件时，先初始化名为 `email` 的 Reach 发送渠道，再提交反馈验证收件人与管理链接。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: reach
  provider: email
  recipients: [support@example.com]
  adminUrl: https://admin.example.com/feedback
```

业务材料收集函数通过 `feedback.init(config, { collectEvidence })` 注册。配置 Webhook 后可让外部系统按事件 ID 确认收到通知。见[业务补采和 Webhook](../function/feedback.md#service)。

### 运维调优

| 路径 | 默认值与约束 | 用途 |
| --- | --- | --- |
| `limits.maxTotalBytes` | 32 MiB，4–40 MiB，填写字节 | 未压缩导出总预算。材料和加密传输容量从此派生。 |
| `limits.maxAttachmentBytes` | 5 MiB，1 字节–5 MiB | 单个附件上限，同时受总预算约束。 |
| `limits.maxEvidenceBytes` | 4 MiB，1024 字节–4 MiB | 单份反馈的证据总字节上限。 |
| `limits.maxEvidenceCount` | 2000，允许 1–10000 | 实际最多 2000 条，服务端为环境与补采预留容量。 |
| `limits.maxReportsPerUserDay` | 20，1–10000 条 | 按数据库 UTC 日和应用、范围、用户计量受理条数。幂等重试只计一次。 |
| `limits.maxBytesPerUserDay` | 2 GiB，4 MiB–1 TiB，填写字节 | 用户每日的报告及历史导出预留额。 |
| `limits.maxStoredBytesPerScope` | 10 GiB，4 MiB–1 TiB，填写字节 | 应用内范围累计预留额。过期反馈清理成功后释放。 |
| `limits.maxExportsPerReport` | 5，1–20 | 每份报告的导出次数上限，复用有效快照不重复计次。 |
| `retention.exportHours` | 24，1–720 小时 | 导出 ZIP 到期后禁止下载，由后台删除。 |
| `collection.timeoutMs` | 60000，0–300000 毫秒 | 等候客户端补传材料的时限。 |
| `collection.businessTimeoutMs` | 30000，1–300000 毫秒 | 单次业务收集回调的时限。 |
| `webhook.timeoutMs` | 10000，1–60000 毫秒 | 单次 Webhook 请求时限，失败进入后台重试。 |
| `worker.intervalMs` | 1000，0–60000 毫秒 | 任务扫描间隔，设为 0 时由宿主调用 `feedback.runJobs()`。 |
| `worker.leaseMs` | 30000，1000–300000 毫秒 | 任务领取租期，到期后允许其他实例接手。 |
| `worker.maxAttempts` | 5，1–20 次 | 普通任务的领取上限，含领取后退出。到期清理持续重试。 |

每份反馈预留 `limits.maxTotalBytes × (1 + limits.maxExportsPerReport)`。按默认值每份预留 192 MiB，用户日容量 2 GiB 可受理 10 份。改动配额后，提交带附件的报告并在管理端生成 ZIP，核对生效的限制与代理的材料请求容量。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: disabled
retention:
  days: 7
  exportHours: 12
limits:
  maxAttachmentBytes: 2097152
  maxReportsPerUserDay: 10
```

[反馈通知、采集和保留](operations.md#feedback通知采集和保留)
