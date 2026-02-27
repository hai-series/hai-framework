---
name: hai-reach
description: 使用 @h-ai/reach 进行邮件、短信和 API 回调发送；当需求涉及用户触达、消息通知、验证码发送、多渠道模板管理时使用。
---

# hai-reach

> `@h-ai/reach` 提供统一的用户触达接口，支持同时注册多个 Provider（SMTP 邮件、阿里云短信、API 回调），内置模板引擎，模板绑定 Provider 实现按场景路由发送。

---

## 适用场景

- 同时使用邮件和短信发送通知
- 发送邮件通知（注册欢迎、密码重置、告警等）
- 发送短信验证码或通知
- 通过 HTTP API 回调触发第三方通知
- 定义和管理消息模板（模板绑定到具体 Provider）
- 基于 `ReachErrorCode` 做错误分支处理

---

## 使用步骤

### 1. 配置

```yaml
# config/_reach.yml
providers:
  - name: email
    type: smtp
    host: ${REACH_SMTP_HOST:smtp.example.com}
    port: ${REACH_SMTP_PORT:465}
    secure: true
    user: ${REACH_SMTP_USER:}
    pass: ${REACH_SMTP_PASS:}
    from: ${REACH_FROM:noreply@example.com}
  - name: sms
    type: aliyun-sms
    accessKeyId: ${REACH_ALIYUN_AK:}
    accessKeySecret: ${REACH_ALIYUN_SK:}
    signName: ${REACH_SIGN_NAME:}
  - name: webhook
    type: api
    url: ${REACH_WEBHOOK_URL:}
```

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'

await reach.init(core.config.get('reach'))
// ... 使用触达服务
await reach.close()
```

### 3. 注册模板（模板绑定 Provider）

```typescript
reach.template.register({
  name: 'verification_code',
  provider: 'email',
  subject: '验证码: {code}',
  body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
})

reach.template.registerMany([
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

// 发送短信
await reach.send({
  provider: 'sms',
  to: '13800138000',
  templateCode: 'SMS_123456',
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
}
```

### ReachMessage

| 字段           | 类型                     | 必填 | 说明                   |
| -------------- | ------------------------ | ---- | ---------------------- |
| `provider`     | `string`                 | ✅   | 目标 Provider 名称     |
| `to`           | `string`                 | ✅   | 接收方（邮箱或手机号） |
| `subject`      | `string`                 | —    | 邮件主题（直接发送时） |
| `body`         | `string`                 | —    | 消息正文（直接发送时） |
| `template`     | `string`                 | —    | 模板名称（模板发送时） |
| `vars`         | `Record<string, string>` | —    | 模板变量               |
| `templateCode` | `string`                 | —    | 阿里云短信模板编码     |

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
| `ReachErrorCode.SEND_FAILED`            | 8000 | 发送失败        |
| `ReachErrorCode.TEMPLATE_NOT_FOUND`     | 8001 | 模板未找到      |
| `ReachErrorCode.TEMPLATE_RENDER_FAILED` | 8002 | 模板渲染失败    |
| `ReachErrorCode.INVALID_RECIPIENT`      | 8003 | 无效接收方      |
| `ReachErrorCode.PROVIDER_NOT_FOUND`     | 8004 | Provider 未找到 |
| `ReachErrorCode.NOT_INITIALIZED`        | 8010 | 模块未初始化    |
| `ReachErrorCode.UNSUPPORTED_TYPE`       | 8011 | 不支持的类型    |
| `ReachErrorCode.CONFIG_ERROR`           | 8012 | 配置错误        |

---

## 常见模式

### 多渠道验证码发送

```typescript
reach.template.register({
  name: 'email_code',
  provider: 'email',
  subject: '验证码: {code}',
  body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
})

reach.template.register({
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
    case ReachErrorCode.TEMPLATE_NOT_FOUND:
      break
    case ReachErrorCode.SEND_FAILED:
      break
  }
}
```

---

## 相关 Skills

- `hai-core` — 配置加载、日志、Result 模式
- `hai-db` — 数据库操作（存储发送记录等）
- `hai-cache` — 缓存操作（验证码缓存等）
