# @h-ai/reach

用户触达模块，支持邮件和短信发送，通过 Provider 机制可接入不同供应商。内置模板引擎，支持按场景定义消息模板。

## 支持的 Provider

| Provider     | 渠道 | 说明                      |
| ------------ | ---- | ------------------------- |
| `console`    | 通用 | 控制台输出（开发/测试用） |
| `smtp`       | 邮件 | SMTP 协议发送邮件         |
| `aliyun-sms` | 短信 | 阿里云短信服务            |

## 快速开始

### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`，阿里云短信需安装 `@alicloud/dysmsapi20170525` 和 `@alicloud/openapi-client`。

### SMTP 邮件发送

```ts
import { reach } from '@h-ai/reach'

// 初始化
await reach.init({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  user: 'noreply@example.com',
  pass: 'password',
  from: 'noreply@example.com',
})

// 注册模板
reach.template.register({
  name: 'welcome',
  subject: '欢迎 {userName}',
  body: '亲爱的 {userName}，欢迎使用 {appName}！',
})

// 使用模板发送
const result = await reach.send({
  channel: 'email',
  to: 'user@example.com',
  template: 'welcome',
  vars: { userName: '张三', appName: 'Hai' },
})

// 直接发送
await reach.send({
  channel: 'email',
  to: 'user@example.com',
  subject: '通知',
  body: '这是一封通知邮件。',
})

// 关闭
await reach.close()
```

### 阿里云短信

```ts
import { reach } from '@h-ai/reach'

await reach.init({
  type: 'aliyun-sms',
  accessKeyId: 'LTAI...',
  accessKeySecret: '...',
  signName: '某某科技',
})

await reach.send({
  channel: 'sms',
  to: '13800138000',
  templateCode: 'SMS_123456',
  vars: { code: '123456' },
})

await reach.close()
```

## 配置

### Console（开发/测试）

```ts
{ type: 'console' }
```

### SMTP

| 字段     | 类型      | 必填 | 默认值 | 说明            |
| -------- | --------- | ---- | ------ | --------------- |
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
| `type`            | `string` | ✅   | —                       | 固定 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID        |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret    |
| `signName`        | `string` | ✅   | —                       | 短信签名            |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API 端点            |

## 错误处理

所有操作返回 `Result<T, ReachError>`，错误码定义在 `ReachErrorCode`：

```ts
const result = await reach.send({ channel: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

## 测试

```bash
pnpm --filter @h-ai/reach test
```

## License

Apache-2.0
