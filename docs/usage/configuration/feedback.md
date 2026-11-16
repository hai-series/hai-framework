# Feedback 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_feedback.yml`，配置注册名为 `feedback`，环境覆盖前缀为 `HAI_FEEDBACK_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

调用 `feedback.init(config, options?)`，`FeedbackConfigSchema` 校验 `config`；由宿主通过 `options.collectEvidence` 注册可选的业务采集回调。服务端负责持久化、后台采集及投递。应用身份和构建标识用于定位收集来源，同一部署的前后端应保持标识一致。

## 配置示例

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                        | 默认值/必填   | 说明                                                                                                             |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `appId`                       | 必填          | 反馈所属应用标识；应与浏览器及 API 入口配置一致。可填字符串，1–128 个字符                                        |
| `appVersion`                  | 可省略        | 当前应用版本，作为默认诊断信息保存。可填字符串，最多 128 个字符                                                  |
| `buildId`                     | 可省略        | 构建标识，帮助定位发布产物。可填字符串，最多 128 个字符                                                          |
| `commit`                      | 可省略        | 源码提交标识，帮助定位对应代码。可填字符串，最多 128 个字符                                                      |
| `notificationMode`            | `"reach"`     | disabled 不通知，console 默认仅输出元数据，reach 使用已有通知通道。可填`"disabled"`、`"console"`、`"reach"`      |
| `consoleContent`              | `"metadata"`  | console 通知内容；metadata 只输出定位和采集状态，summary 显式加入通用脱敏摘要。可填`"metadata"`、`"summary"`     |
| `recipients`                  | `[]`          | Reach 接收方，由实际 Provider 校验邮箱、手机号或业务目的地。可填数组（元素为字符串，1–320 个字符），最多 20 项   |
| `notificationProvider`        | `"email"`     | 已初始化 Reach Provider 的唯一名称，不限制为邮件。可填字符串，至少 1 个字符                                      |
| `adminUrl`                    | 可省略        | 管理员通知中的反馈管理页面地址。可填字符串，URL                                                                  |
| `collectionTimeoutMs`         | `60000`       | 补充材料收集超时，单位毫秒；超时后冻结为完整或部分材料。可填整数，0–300000                                       |
| `businessCollectionTimeoutMs` | `30000`       | 业务 collectEvidence 异步回调的等待上限，单位毫秒；超时后重试采集任务。可填整数，1–300000                        |
| `webhookUrl`                  | `""`          | 反馈采集结束后的 Webhook 地址；空字符串禁用，只允许可信 HTTP(S) 地址且不跟随重定向。可填字符串，最多 2048 个字符 |
| `webhookSecret`               | `""`          | Webhook HMAC-SHA256 签名密钥；空字符串不签名，仅服务端私有环境配置。可填字符串，最多 4096 个字符                 |
| `webhookTimeoutMs`            | `10000`       | 单次 Webhook 请求超时，单位毫秒；非 2xx 或超时均进入持久重试。可填整数，1–60000                                  |
| `workerIntervalMs`            | `1000`        | 持久任务扫描间隔，单位毫秒；零值由宿主手动运行任务。可填整数，0–60000                                            |
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

开发可以用 `console` 记录反馈元信息。使用 `reach` 前配置收件人及实际 Provider；`webhookUrl` 启用独立回调，密钥只在服务端注入。调整限制后分别验证上传、入库、后台处理、通知和导出。[反馈通知、采集和保留](operations.md#feedback通知采集和保留)
