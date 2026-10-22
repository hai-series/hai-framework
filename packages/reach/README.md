# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

## 简介

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。内置免打扰（DND）机制，支持通过配置文件定义模板。

模板发送只需 `template`、`to` 和 `vars`，Provider 默认来自模板；显式 `provider` 仍可覆盖。无模板的直接发送必须提供 Provider，缺少时返回失败 HaiResult。

## 核心功能清单

| Provider     | 渠道 | 说明                                        |
| ------------ | ---- | ------------------------------------------- |
| `console`    | 通用 | 控制台输出（开发/测试用）                   |
| `smtp`       | 邮件 | SMTP 协议发送邮件（需安装 nodemailer）      |
| `aliyun-sms` | 短信 | 阿里云短信服务（直接调用 HTTP API，无 SDK） |
| `api`        | 通用 | HTTP API 回调（通用 webhook）               |

## 使用入门

### 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化）；启用 `dnd.enabled: true` 与 `strategy: delay` 时必须先初始化且队列表可用，否则 `reach.init()` 返回 `CONFIG_ERROR`。其他发送场景可选
- `@h-ai/cache` — 缓存（DND delay 策略分布式锁），可选；已初始化时自动启用分布式锁

### 快速开始

#### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`。

#### 多 Provider 初始化

```ts
import { reach } from '@h-ai/reach'

const initialized = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
  templates: [{ name: 'welcome', provider: 'local', subject: 'Welcome', body: 'Hello {userName}' }],
})
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' },
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  await reach.close()
}
```

以上示例使用开发 Console Provider，只记录发送元数据，不实际发邮件或短信。需要真实投递时，按下方配置 SMTP、短信或 API Provider；数据库持久化和共享缓存按需初始化。

`reach.config` 返回的是**脱敏后的配置快照**：`api.url` / `endpoint` 的内嵌凭证，以及 `headers.Authorization`、SMTP `pass`、短信密钥等敏感值会自动隐藏。

### 配置

#### Console（开发/测试）

```ts
const config = { name: 'dev', type: 'console' }
```

#### SMTP

| 字段     | 类型      | 必填 | 默认值 | 说明            |
| -------- | --------- | ---- | ------ | --------------- |
| `name`   | `string`  | ✅   | —      | Provider 名称   |
| `type`   | `string`  | ✅   | —      | 固定 `'smtp'`   |
| `host`   | `string`  | ✅   | —      | SMTP 服务器地址 |
| `port`   | `number`  | —    | `465`  | SMTP 端口       |
| `secure` | `boolean` | —    | `true` | 是否使用 TLS    |
| `user`   | `string`  | —    | —      | 认证用户名      |
| `pass`   | `string`  | —    | —      | 认证密码        |
| `from`   | `string`  | ✅   | —      | 发件人地址      |

#### 阿里云短信

| 字段              | 类型     | 必填 | 默认值                  | 说明                |
| ----------------- | -------- | ---- | ----------------------- | ------------------- |
| `name`            | `string` | ✅   | —                       | Provider 名称       |
| `type`            | `string` | ✅   | —                       | 固定 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID        |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret    |
| `signName`        | `string` | ✅   | —                       | 短信签名            |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API 端点            |

#### API 回调

| 字段      | 类型                     | 必填 | 默认值  | 说明             |
| --------- | ------------------------ | ---- | ------- | ---------------- |
| `name`    | `string`                 | ✅   | —       | Provider 名称    |
| `type`    | `string`                 | ✅   | —       | 固定 `'api'`     |
| `url`     | `string`                 | ✅   | —       | HTTP(S) 回调 URL |
| `method`  | `'POST' \| 'PUT'`        | —    | `POST`  | HTTP 方法        |
| `headers` | `Record<string, string>` | —    | —       | 自定义请求头     |
| `timeout` | `number`                 | —    | `10000` | 超时毫秒数       |

API 回调地址属于服务端可信配置。日志只记录回调 origin，不记录 URL 凭据、查询参数、收件人或第三方失败响应体。若回调地址来自租户/用户输入，应用层必须配置域名 allowlist；企业部署还应通过出口代理或网络策略阻止访问内网元数据地址。

#### DND（免打扰）

| 字段       | 类型                   | 必填 | 默认值    | 说明                                    |
| ---------- | ---------------------- | ---- | --------- | --------------------------------------- |
| `enabled`  | `boolean`              | —    | `false`   | 是否启用                                |
| `strategy` | `'discard' \| 'delay'` | —    | `discard` | discard 丢弃 / delay 延时（DND 后发送） |
| `start`    | `string`               | —    | `00:00`   | 开始时间（HH:mm 格式）                  |
| `end`      | `string`               | —    | `00:00`   | 结束时间（HH:mm 格式）                  |

`delay` 仅在消息写入数据库并确认成功后返回 `HaiResult` 成功，结果为 `{ success: true, deferred: true, queueId }`；这表示已入队、尚未投递。`queueId` 是持久化回执 UUID，对应 `hai_reach_send_log.queue_id`，可查询该记录的 `status`（`pending` / `processing` / `sent`）。缺少数据库、断连、插入失败均不会返回 deferred 成功，发送时返回 `SEND_FAILED`。节点重启后，只要连接同一数据库、配置同名 Provider，便可在 DND 时段外恢复投递。即时发送成功后的普通日志保存仍为可选，不会因日志失败把已投递的消息报告为失败。

```ts
const result = await reach.send(message)
if (!result.success)
  throw new Error(result.error.message)
if (result.data.deferred) {
  // 保存 queueId 供后台跟踪；此时不能向用户显示“已送达”。
  await savePendingReceipt(result.data.queueId)
}
```

队列的 `created_at`、`updated_at`、`locked_until` 统一保存 Unix 毫秒，列类型为 `BIGINT`（SQLite 映射为 64 位 `INTEGER`）。Reach 仓库将 PostgreSQL 等驱动返回的整数字符串归一化为安全整数 `number`；负数、非整数及超出 JS 安全整数范围的存储值返回 `SEND_FAILED`，不会静默舍入。模板仓库的 `TIMESTAMP` 创建/更新时间映射为 `Date`。部署时须同步更新已有表的列类型，框架不自动迁移旧表。

### 错误处理

所有操作返回 `HaiResult<T>`，错误码定义在 `HaiReachError`：

| 错误码                                 | code            | 说明            |
| -------------------------------------- | --------------- | --------------- |
| `HaiReachError.SEND_FAILED`            | `hai:reach:001` | 发送失败        |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002` | 模板不存在      |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003` | 模板渲染失败    |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004` | 无效接收方      |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005` | Provider 未注册 |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006` | 免打扰丢弃      |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | 未初始化        |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | 不支持的类型    |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | 配置错误        |

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

### 分布式锁

多节点部署时，DND（delay 策略）的 pending 消息 flush 操作通过 `@h-ai/cache` 分布式锁保护，确保同一时刻只有一个节点执行 flush。

- 锁基于 `cache.lock.acquire('reach:flush-pending')`，TTL 300 秒
- flush 会按批 claim pending 记录；处理中的记录带有过期时间，节点异常退出后可由后续节点接管，降低重复发送风险
- 若 `@h-ai/cache` 未初始化，分布式锁自动禁用，不影响单节点运行
- 使用稳定的进程级 owner 标识，防止误释放他人锁

## 开发测试

```bash
pnpm --filter @h-ai/reach test
```

跨库时间回归用例 `tests/reach-repository-send-log-databases.test.ts` 通过 Testcontainers 启动隔离 PostgreSQL 16.15 / MySQL 8.4.11，并在结束时清理容器；须提供可用的 Docker API。使用 Podman 时，将 `DOCKER_HOST` 指向其兼容 socket；rootless 环境可按 Testcontainers 要求设置 `TESTCONTAINERS_RYUK_DISABLED=true`。

## 许可证

Apache-2.0
