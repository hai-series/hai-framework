# @h-ai/reach

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。内置免打扰（DND）机制，支持通过配置文件定义模板。

## 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化），可选；已初始化时自动启用持久化
- `@h-ai/cache` — 缓存（DND delay 策略分布式锁），可选；已初始化时自动启用分布式锁

## 支持的 Provider

| Provider     | 渠道 | 说明                                        |
| ------------ | ---- | ------------------------------------------- |
| `console`    | 通用 | 控制台输出（开发/测试用）                   |
| `smtp`       | 邮件 | SMTP 协议发送邮件（需安装 nodemailer）      |
| `aliyun-sms` | 短信 | 阿里云短信服务（直接调用 HTTP API，无 SDK） |
| `api`        | 通用 | HTTP API 回调（通用 webhook）               |

## 快速开始

### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`。

### 多 Provider 初始化

```ts
import { cache } from '@h-ai/cache'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

// 1. 初始化可选依赖（按需）
await reldb.init({ type: 'sqlite', database: './data.db' }) // 可选，启用发送日志与模板持久化
await cache.init({ type: 'memory' }) // 可选，启用 DND delay 策略分布式锁

// 2. 初始化触达模块（自动检测已初始化的 reldb/cache 单例）
await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '某某科技' },
    { name: 'webhook', type: 'api', url: 'https://api.example.com/notify' },
  ],
  templates: [
    { name: 'welcome_email', provider: 'email', subject: '欢迎 {userName}', body: '亲爱的 {userName}，欢迎！' },
    { name: 'sms_code', provider: 'sms', body: '验证码: {code}，{minutes} 分钟内有效。' },
  ],
  dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
})

// 通过 provider 字段选择发送渠道
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  template: 'welcome_email',
  vars: { userName: '张三' },
})

// 发送短信（通过 extra 传递 Provider 特有参数）
await reach.send({
  provider: 'sms',
  to: '13800138000',
  extra: { templateCode: 'SMS_123456' },
  vars: { code: '123456' },
})

// 关闭所有 Provider
await reach.close()
```

## 配置

### Console（开发/测试）

```ts
const config = { name: 'dev', type: 'console' }
```

### SMTP

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

### 阿里云短信

| 字段              | 类型     | 必填 | 默认值                  | 说明                |
| ----------------- | -------- | ---- | ----------------------- | ------------------- |
| `name`            | `string` | ✅   | —                       | Provider 名称       |
| `type`            | `string` | ✅   | —                       | 固定 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID        |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret    |
| `signName`        | `string` | ✅   | —                       | 短信签名            |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API 端点            |

### API 回调

| 字段      | 类型                     | 必填 | 默认值  | 说明          |
| --------- | ------------------------ | ---- | ------- | ------------- |
| `name`    | `string`                 | ✅   | —       | Provider 名称 |
| `type`    | `string`                 | ✅   | —       | 固定 `'api'`  |
| `url`     | `string`                 | ✅   | —       | 回调 URL      |
| `method`  | `'POST' \| 'PUT'`        | —    | `POST`  | HTTP 方法     |
| `headers` | `Record<string, string>` | —    | —       | 自定义请求头  |
| `timeout` | `number`                 | —    | `10000` | 超时毫秒数    |

### DND（免打扰）

| 字段       | 类型                   | 必填 | 默认值    | 说明                                    |
| ---------- | ---------------------- | ---- | --------- | --------------------------------------- |
| `enabled`  | `boolean`              | —    | `false`   | 是否启用                                |
| `strategy` | `'discard' \| 'delay'` | —    | `discard` | discard 丢弃 / delay 延时（DND 后发送） |
| `start`    | `string`               | —    | `00:00`   | 开始时间（HH:mm 格式）                  |
| `end`      | `string`               | —    | `00:00`   | 结束时间（HH:mm 格式）                  |

## 错误处理

所有操作返回 `HaiResult<T>`，错误码定义在 `ReachErrorCode`：

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

## 分布式锁

多节点部署时，DND（delay 策略）的 pending 消息 flush 操作通过 `@h-ai/cache` 分布式锁保护，确保同一时刻只有一个节点执行 flush。

- 锁基于 `cache.lock.acquire('reach:flush-pending')`，TTL 60 秒
- 若 `@h-ai/cache` 未初始化，分布式锁自动禁用，不影响单节点运行
- 使用稳定的进程级 owner 标识，防止误释放他人锁

## 测试

```bash
pnpm --filter @h-ai/reach test
```

## License

Apache-2.0
