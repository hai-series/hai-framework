# Reach 配置

[配置手册](README.md)

## 配置入口

生成的项目把消息渠道和模板放在 `config/_reach.yml`。应用启动时从 `core.config.get('reach')` 读取并传给 `reach.init()`。用环境变量覆盖时使用 `HAI_REACH_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

给每个发送渠道取一个不同的 `name`，如 `email` 或 `warehouse-webhook`。发送时应用用这个名字选择渠道。HTTP 网关需要动态生成请求头或正文时，用 `reach.init(config, { gatewayHooks })` 传入以渠道名称为键的处理函数。

## 配置示例

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: console
```

## 配置清单

`providers[]` 指 `providers` 列表中的每个渠道。例子里的 `type: console` 只记日志。改用 SMTP 时，需要为这条渠道填写 SMTP 的连接字段。

| 配置项                                  | 适用条件          | 默认值/必填               | 说明                                                                                                              |
| --------------------------------------- | ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `providers`                             | 通用              | 必填                      | Provider 配置列表。可填数组（元素为 `type=console` 或 `type=smtp` 或 `type=aliyun-sms` 或 `type=api`），至少 1 项 |
| `providers[].name`                      | `type=console`    | 必填                      | 用于引用或区分这一项的名称。可填字符串，至少 1 个字符                                                             |
| `providers[].type`                      | `type=console`    | 必填                      | 选择后端或配置方式。可填 `"console"`                                                                              |
| `providers[].name`                      | `type=smtp`       | 必填                      | 用于引用或区分这一项的名称。可填字符串，至少 1 个字符                                                             |
| `providers[].type`                      | `type=smtp`       | 必填                      | 选择后端或配置方式。可填 `"smtp"`                                                                                 |
| `providers[].host`                      | `type=smtp`       | 必填                      | SMTP 服务器地址。可填字符串，至少 1 个字符                                                                        |
| `providers[].port`                      | `type=smtp`       | `465`                     | SMTP 端口。可填整数，1–65535                                                                                      |
| `providers[].secure`                    | `type=smtp`       | `true`                    | 是否使用 TLS                                                                                                      |
| `providers[].user`                      | `type=smtp`       | 可省略                    | SMTP 认证用户名                                                                                                   |
| `providers[].pass`                      | `type=smtp`       | 可省略                    | SMTP 认证密码                                                                                                     |
| `providers[].from`                      | `type=smtp`       | 必填                      | 发件人地址。可填字符串，至少 1 个字符                                                                             |
| `providers[].name`                      | `type=aliyun-sms` | 必填                      | 用于引用或区分这一项的名称。可填字符串，至少 1 个字符                                                             |
| `providers[].type`                      | `type=aliyun-sms` | 必填                      | 选择后端或配置方式。可填 `"aliyun-sms"`                                                                           |
| `providers[].accessKeyId`               | `type=aliyun-sms` | 必填                      | 阿里云 AccessKey ID。可填字符串，至少 1 个字符                                                                    |
| `providers[].accessKeySecret`           | `type=aliyun-sms` | 必填                      | 阿里云 AccessKey Secret。可填字符串，至少 1 个字符                                                                |
| `providers[].signName`                  | `type=aliyun-sms` | 必填                      | 短信签名。可填字符串，至少 1 个字符                                                                               |
| `providers[].endpoint`                  | `type=aliyun-sms` | `"dysmsapi.aliyuncs.com"` | 直连 API 端点（默认 dysmsapi.aliyuncs.com）；配置网关时使用网关 URL                                               |
| `providers[].gateway`                   | `type=aliyun-sms` | 可省略                    | 可选的短信隔离网关，以 POST 请求转发已签名的查询参数                                                              |
| `providers[].gateway.url`               | `type=aliyun-sms` | 必填                      | 字符串，URL                                                                                                       |
| `providers[].gateway.allowInsecureHttp` | `type=aliyun-sms` | `false`                   | 仅在受信内网显式允许明文 HTTP                                                                                     |
| `providers[].gateway.headers`           | `type=aliyun-sms` | 可省略                    | 短信网关的附加 HTTP 请求头                                                                                        |
| `providers[].gateway.headers.<名称>`    | `type=aliyun-sms` | 必填                      | 键为请求头名称，值为对应请求头内容                                                                                |
| `providers[].gateway.body`              | `type=aliyun-sms` | 可省略                    | 字符串 或 数组 或 键值对象                                                                                        |
| `providers[].name`                      | `type=api`        | 必填                      | 用于引用或区分这一项的名称。可填字符串，至少 1 个字符                                                             |
| `providers[].type`                      | `type=api`        | 必填                      | 选择后端或配置方式。可填 `"api"`                                                                                  |
| `providers[].url`                       | `type=api`        | 必填                      | 字符串，URL                                                                                                       |
| `providers[].method`                    | `type=api`        | `"POST"`                  | HTTP 方法。可填 `"POST"`、`"PUT"`                                                                                 |
| `providers[].headers`                   | `type=api`        | 可省略                    | API 通道发送的自定义 HTTP 请求头                                                                                  |
| `providers[].headers.<名称>`            | `type=api`        | 必填                      | 键为请求头名称，值为对应请求头内容                                                                                |
| `providers[].timeout`                   | `type=api`        | `10000`                   | 请求超时毫秒数。非负整数                                                                                          |
| `providers[].redirect`                  | `type=api`        | `"error"`                 | HTTP 重定向策略；默认拒绝。敏感发送始终拒绝，即使普通发送显式允许。可填 `"error"`、`"follow"`                     |
| `providers[].requireHttps`              | `type=api`        | 可省略                    | 强制 HTTPS；省略时生产敏感发送要求 HTTPS，显式 false 仅用于受信内网传输                                           |
| `providers[].idempotent`                | `type=api`        | `false`                   | 接收端按 Idempotency-Key 原子持久去重，且覆盖所有重试与旧节点迟到请求时才启用                                     |
| `templates`                             | 通用              | 可省略                    | 模板配置（通过配置文件注册）                                                                                      |
| `templates[].name`                      | 通用              | 必填                      | 用于引用或区分这一项的名称。可填字符串，至少 1 个字符                                                             |
| `templates[].provider`                  | 通用              | 必填                      | 绑定的 Provider 名称。可填字符串，至少 1 个字符                                                                   |
| `templates[].subject`                   | 通用              | 可省略                    | 邮件主题模板                                                                                                      |
| `templates[].body`                      | 通用              | 必填                      | 字符串，至少 1 个字符                                                                                             |
| `dnd`                                   | 通用              | 可省略                    | 免打扰配置                                                                                                        |
| `dnd.enabled`                           | 通用              | `false`                   | 是否启用免打扰                                                                                                    |
| `dnd.strategy`                          | 通用              | `"discard"`               | discard 丢弃；delay 要求数据库队列就绪并确认入队（默认 discard）。可填 `"discard"`、`"delay"`                     |
| `dnd.start`                             | 通用              | `"00:00"`                 | 免打扰开始时间（HH:mm 格式）                                                                                      |
| `dnd.end`                               | 通用              | `"00:00"`                 | 免打扰结束时间（HH:mm 格式）                                                                                      |
| `queue`                                 | 通用              | 省略时使用下列重试设置    | 可靠队列每条消息入队时记录的重试策略                                                                              |
| `queue.maxAttempts`                     | 通用              | `5`                       | 每条队列消息最多处理多少次，包含首次发送、失败重试和异常退出后的重新处理。可填整数，1–100                         |
| `queue.retryDelayMs`                    | 通用              | `60000`                   | 第一次发送失败后，等待多少毫秒再试。可填整数，1000–86400000                                                       |
| `queue.maxRetryDelayMs`                 | 通用              | `3600000`                 | 后续失败时等待时间逐次加倍，但不超过此值。可填整数，1000–86400000                                                 |

## 生效与核对

先使用 Console Provider 验证调用路径，再切换到真实 SMTP、HTTP API、短信通道。超时及重试会影响外部投递次数。实际结构和投递流程见[通知通道、免打扰与失败队列](operations.md#reach通道免打扰与失败队列)。
