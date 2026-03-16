---
name: hai-reach
description: 使用 @h-ai/reach 进行邮件、短信和 API 回调发送；当需求涉及用户触达、消息通知、验证码发送、多渠道模板管理时使用。
---

# hai-reach

> `@h-ai/reach` 提供统一的用户触达接口，支持同时注册多个 Provider（SMTP 邮件、短信、API 回调），内置模板引擎与免打扰（DND）机制。

---

## 适用场景

- 同时使用邮件、短信、API 回调发送通知
- 发送邮件通知（注册欢迎、密码重置、告警等）
- 发送短信验证码或通知
- 通过 HTTP API 回调触发第三方通知
- 定义和管理消息模板（模板绑定到具体 Provider，支持配置文件定义）
- 免打扰时段控制
- 基于 `ReachErrorCode` 做错误分支处理

---

## 使用步骤

### 1. 配置

```yaml
# config/_reach.yml
providers:
  - name: email
    type: smtp
    host: ${HAI_REACH_SMTP_HOST:smtp.example.com}
    port: ${HAI_REACH_SMTP_PORT:465}
    secure: true
    user: ${HAI_REACH_SMTP_USER:}
    pass: ${HAI_REACH_SMTP_PASS:}
    from: ${HAI_REACH_SMTP_FROM:noreply@example.com}
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_SMS_ACCESS_KEY:}
    accessKeySecret: ${HAI_REACH_SMS_SECRET_KEY:}
    signName: ${HAI_REACH_SMS_SIGN_NAME:}
  - name: webhook
    type: api
    url: ${HAI_REACH_WEBHOOK_URL:}

# 模板（可选，也可通过代码注册）
templates:
  - name: verification_code
    provider: email
    subject: '验证码: {code}'
    body: '您的验证码是 {code}，有效期 {minutes} 分钟。'
  - name: sms_code
    provider: sms
    body: '验证码: {code}，{minutes} 分钟内有效。'

# 免打扰（可选）
dnd:
  enabled: true
  strategy: delay # discard（丢弃）或 delay（延时，DND 结束后集中发送）
  start: '22:00'
  end: '08:00'
```

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'

await reach.init(core.config.get('reach'))
// ... 使用触达服务
await reach.close()
```

### 3. 保存模板（模板绑定 Provider）

```typescript
// 通过代码保存（配置文件中的模板在 init 时自动注册）
await reach.template.save({
  name: 'verification_code',
  provider: 'email',
  subject: '验证码: {code}',
  body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
})

await reach.template.saveBatch([
  { name: 'welcome', provider: 'email', subject: '欢迎 {userName}', body: '亲爱的 {userName}，欢迎使用 {appName}！' },
  { name: 'sms_code', provider: 'sms', body: '验证码: {code}，{minutes} 分钟内有效。' },
])
```

### 4. 发送消息

```typescript
// 使用模板发送邮件（指定 provider）
const result = await reach.send({
  provider: 'email',
  to: 'user@example.com',
  template: 'verification_code',
  vars: { code: '123456', minutes: '5' },
})

// 直接发送邮件（无模板）
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  subject: '通知',
  body: '<h1>Hello</h1>',
})

// 发送短信（通过 extra 传递 Provider 特有参数）
await reach.send({
  provider: 'sms',
  to: '13800138000',
  extra: { templateCode: 'SMS_123456' },
  vars: { code: '654321' },
})

// API 回调
await reach.send({
  provider: 'webhook',
  to: 'user@example.com',
  body: '{"event":"signup"}',
})
```

---

## 核心 API

### reach 对象

| 方法 / 属性           | 签名                                                     | 说明                               |
| --------------------- | -------------------------------------------------------- | ---------------------------------- |
| `reach.init`          | `(config: ReachConfigInput) => Promise<Result<void>>`    | 初始化（注册多个 Provider）        |
| `reach.send`          | `(message: ReachMessage) => Promise<Result<SendResult>>` | 发送消息（通过 provider 字段路由） |
| `reach.template`      | `ReachTemplateRegistry`                                  | 模板注册表                         |
| `reach.config`        | `ReachConfig \| null`                                    | 当前配置                           |
| `reach.isInitialized` | `boolean`                                                | 是否已初始化                       |
| `reach.close`         | `() => Promise<void>`                                    | 关闭所有连接                       |

### ReachConfigInput

```typescript
interface ReachConfigInput {
  providers: ProviderConfig[] // 多个 Provider 配置
  templates?: TemplateConfig[] // 通过配置文件定义的模板
  dnd?: {
    enabled: boolean // 是否启用
    strategy: 'discard' | 'delay' // discard 丢弃 / delay 延时发送
    start: string // 开始时间 HH:mm
    end: string // 结束时间 HH:mm
  }
}
```

### ReachMessage

| 字段       | 类型                      | 必填 | 说明                                |
| ---------- | ------------------------- | ---- | ----------------------------------- |
| `provider` | `string`                  | ✅   | 目标 Provider 名称                  |
| `to`       | `string`                  | ✅   | 接收方（邮箱或手机号）              |
| `subject`  | `string`                  | —    | 邮件主题（直接发送时）              |
| `body`     | `string`                  | —    | 消息正文（直接发送时）              |
| `template` | `string`                  | —    | 模板名称（模板发送时）              |
| `vars`     | `Record<string, string>`  | —    | 模板变量                            |
| `extra`    | `Record<string, unknown>` | —    | Provider 扩展参数（如短信模板编码） |

### ReachTemplate（模板绑定 Provider）

| 字段       | 类型     | 必填 | 说明                 |
| ---------- | -------- | ---- | -------------------- |
| `name`     | `string` | ✅   | 模板名称             |
| `provider` | `string` | ✅   | 绑定的 Provider 名称 |
| `subject`  | `string` | —    | 邮件主题模板         |
| `body`     | `string` | ✅   | 正文模板             |

---

## 错误码

| 错误码                                  | 值   | 含义            |
| --------------------------------------- | ---- | --------------- |
| `ReachErrorCode.SEND_FAILED`            | 8100 | 发送失败        |
| `ReachErrorCode.TEMPLATE_NOT_FOUND`     | 8101 | 模板未找到      |
| `ReachErrorCode.TEMPLATE_RENDER_FAILED` | 8102 | 模板渲染失败    |
| `ReachErrorCode.INVALID_RECIPIENT`      | 8103 | 无效接收方      |
| `ReachErrorCode.PROVIDER_NOT_FOUND`     | 8104 | Provider 未找到 |
| `ReachErrorCode.DND_BLOCKED`            | 8105 | 免打扰丢弃      |
| `ReachErrorCode.DND_DEFERRED`           | 8106 | 免打扰延时暂存  |
| `ReachErrorCode.NOT_INITIALIZED`        | 8110 | 模块未初始化    |
| `ReachErrorCode.UNSUPPORTED_TYPE`       | 8111 | 不支持的类型    |
| `ReachErrorCode.CONFIG_ERROR`           | 8112 | 配置错误        |

---

## 常见模式

### 多渠道验证码发送

```typescript
reach.template.save({
  name: 'email_code',
  provider: 'email',
  subject: '验证码: {code}',
  body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
})

reach.template.save({
  name: 'sms_code',
  provider: 'sms',
  body: '验证码: {code}，{minutes} 分钟内有效。',
})

// 根据用户选择的渠道发送
async function sendCode(channel: 'email' | 'sms', target: string, code: string) {
  const template = channel === 'email' ? 'email_code' : 'sms_code'
  return reach.send({
    provider: channel,
    to: target,
    template,
    vars: { code, minutes: '5' },
  })
}
```

### 与 IAM 集成（密码重置 / OTP 验证码）

```typescript
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'

// 初始化 reach（注册 email 和 sms Provider）
await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '...' },
  ],
  templates: [
    { name: 'password_reset', provider: 'email', subject: 'Password Reset', body: 'Token: {token}, expires: {expiresAt}' },
    { name: 'otp_email', provider: 'email', subject: 'Code: {code}', body: 'Your code is {code}' },
    { name: 'otp_sms', provider: 'sms', body: 'Your code is {code}' },
  ],
})

// 初始化 IAM，使用 reach 发送通知
await iam.init({
  db,
  cache,
  onPasswordResetRequest: async (user, token, expiresAt) => {
    await reach.send({ provider: 'email', to: user.email ?? '', template: 'password_reset', vars: { token, expiresAt: expiresAt.toISOString() } })
  },
  onOtpSendEmail: async (email, code) => {
    await reach.send({ provider: 'email', to: email, template: 'otp_email', vars: { code } })
  },
  onOtpSendSms: async (phone, code) => {
    await reach.send({ provider: 'sms', to: phone, template: 'otp_sms', vars: { code } })
  },
})
```

### 错误处理

```typescript
import { ReachErrorCode } from '@h-ai/reach'

const result = await reach.send(message)
if (!result.success) {
  switch (result.error.code) {
    case ReachErrorCode.NOT_INITIALIZED:
      break
    case ReachErrorCode.PROVIDER_NOT_FOUND:
      break
    case ReachErrorCode.DND_BLOCKED:
      // 免打扰时段（discard 策略），消息已丢弃
      break
    case ReachErrorCode.TEMPLATE_NOT_FOUND:
      break
    case ReachErrorCode.SEND_FAILED:
      break
  }
}
```

### 分布式锁（DND flush 保护）

> 多节点部署时，DND（delay 策略）的 pending 消息 flush 通过 `@h-ai/cache` 分布式锁保护，确保同一时刻只有一个节点执行 flush。

```typescript
import { cache } from '@h-ai/cache'

// 初始化 cache 后，reach 自动使用分布式锁保护 flush 操作
await cache.init({ type: 'redis', host: 'localhost', port: 6379 })
await reach.init({ /* ... */ })
```

- 锁键：`reach:flush-pending`，TTL 60 秒
- 若 cache 未初始化，分布式锁自动禁用，不影响单节点运行
- 使用稳定的进程级 owner 标识，防止误释放他人锁

---

## 相关 Skills

- `hai-core` — 配置加载、日志、Result 模式
- `hai-reldb` — 数据库操作（存储发送记录等）
- `hai-cache` — 缓存操作、分布式锁（DND flush 互斥）
