# Feedback 配置

[English](feedback.en.md) · [日本語](feedback.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目将反馈相关设置写在 `config/_feedback.yml`。应用启动时从 `core.config.get('feedback')` 取出配置并传给 `feedback.init()`。用环境变量覆盖时使用 `HAI_FEEDBACK_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

服务端保存报告、执行后台任务并发送通知。应用要把自己的业务日志一并附在报告中时，可以在 `feedback.init(config, { collectEvidence })` 中传入收集函数。同一次部署的页面和服务端应使用同一构建标识，便于把用户反馈对应到具体版本。

## 配置示例

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

<a id="configuration-fields"></a>

## 配置清单

例如，省略 `notificationMode` 默认使用 `reach` 发送通知，因此需要为该模式设置收件方。下例显式改为 `console`，开发时只在服务端日志中看到反馈编号等基本信息。

| 配置项                        | 默认值/必填   | 说明                                                                                                             |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `appId`                       | 必填          | 反馈所属应用标识；应与浏览器及 API 入口配置一致。可填字符串，1–128 个字符                                        |
| `appVersion`                  | 可省略        | 当前应用版本，作为默认诊断信息保存。可填字符串，最多 128 个字符                                                  |
| `buildId`                     | 可省略        | 构建标识，帮助定位发布产物。可填字符串，最多 128 个字符                                                          |
| `commit`                      | 可省略        | 源码提交标识，帮助定位对应代码。可填字符串，最多 128 个字符                                                      |
| `notificationMode`            | `"reach"`     | disabled 不通知，console 默认仅输出元数据，reach 使用已有通知通道。可填 `"disabled"`、`"console"`、`"reach"`     |
| `consoleContent`              | `"metadata"`  | console 通知内容；metadata 只输出定位和采集状态，summary 显式加入通用脱敏摘要。可填 `"metadata"`、`"summary"`    |
| `recipients`                  | `[]`          | Reach 接收方，由实际 Provider 校验邮箱、手机号或业务目的地。可填数组（元素为字符串，1–320 个字符），最多 20 项   |
| `notificationProvider`        | `"email"`     | 已初始化 Reach Provider 的唯一名称，不限制为邮件。可填字符串，至少 1 个字符                                      |
| `adminUrl`                    | 可省略        | 管理员通知中的反馈管理页面地址。可填字符串，URL                                                                  |
| `collectionTimeoutMs`         | `60000`       | 补充材料收集超时，单位毫秒；超时后冻结为完整或部分材料。可填整数，0–300000                                       |
| `businessCollectionTimeoutMs` | `30000`       | 业务 collectEvidence 异步回调的等待上限，单位毫秒；超时后重试采集任务。可填整数，1–300000                        |
| `webhookUrl`                  | `""`          | 反馈采集结束后的 Webhook 地址；空字符串禁用，只允许可信 HTTP(S) 地址且不跟随重定向。可填字符串，最多 2048 个字符 |
| `webhookSecret`               | `""`          | Webhook HMAC-SHA256 签名密钥；空字符串不签名，仅服务端私有环境配置。可填字符串，最多 4096 个字符                 |
| `webhookTimeoutMs`            | `10000`       | 单次 Webhook 请求超时，单位毫秒；非 2xx 或超时均进入持久重试。可填整数，1–60000                                  |
| `workerIntervalMs`            | `1000`        | 持久任务扫描间隔，单位毫秒；设为 0 后不会自动扫描，应用可按需手动运行后台任务。可填整数，0–60000                 |
| `leaseMs`                     | `30000`       | 持久任务执行租约时长，单位毫秒；过期后允许其他实例接管。可填整数，1000–300000                                    |
| `maxAttempts`                 | `5`           | 汇集、通知、Webhook 和导出任务最大尝试次数；到期清理持续重试。可填整数，1–20                                     |
| `retentionDays`               | `30`          | 已受理反馈及对象附件的保留天数。可填整数，1–3650                                                                 |
| `maxReportsPerUserDay`        | `20`          | 单个用户按数据库 UTC 日累计受理上限；幂等重试不重复计数。可填整数，1–10000                                       |
| `maxBytesPerUserDay`          | `2147483648`  | 单个用户每日预留存储字节（报告与最多历史导出）。可填整数，4194304–1099511627776                                  |
| `maxStoredBytesPerScope`      | `10737418240` | 应用内单个 scope 的持久材料预留容量；到期清理成功后释放，默认 10 GiB。可填整数，4194304–1099511627776            |
| `maxExportsPerReport`         | `5`           | 单份报告最多历史导出数；已有有效快照复用，不重复计数。可填整数，1–20                                             |
| `exportRetentionHours`        | `24`          | 已完成导出的有效小时数；过期禁止下载，后台删除对象，默认 24 小时。可填整数，1–720                                |
| `envAllowlist`                | `[]`          | 允许采集的服务端环境变量名；凭据类名称仍按敏感信息策略排除。可填数组（元素为字符串，1–128 个字符），最多 100 项  |
| `maxTotalBytes`               | `33554432`    | 未压缩导出总预算；客户端、附件总量和传输预算由此派生。可填整数，4194304–41943040                                 |
| `maxAttachmentBytes`          | `5242880`     | 单个附件允许的最大字节数；同时受总预算约束。可填整数，1–5242880                                                  |
| `maxEvidenceBytes`            | `4194304`     | 单份反馈累计证据允许的最大字节数。可填整数，1024–4194304                                                         |
| `maxEvidenceCount`            | `2000`        | 单份反馈累计证据允许的最大条数。可填整数，1–10000                                                                |

## 生效与核对

开发可用 `console` 在日志中记下反馈编号等信息。用 `reach` 时，需要填收件人，并提供实际能投递的邮件、短信或 API 渠道。填入 `webhookUrl` 后，服务端还会调用该地址。回调密钥在服务端读取。修改容量限制后，提交一份带附件的测试报告，再核对是否能在管理端查询和导出。[反馈通知、采集和保留](operations.md#feedback通知采集和保留)
