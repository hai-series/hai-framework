# @h-ai/reach

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。

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
import { reach } from '@h-ai/reach'

// 同时注册邮件和短信 Provider
await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '某某科技' },
    { name: 'webhook', type: 'api', url: 'https://api.example.com/notify' },
  ],
})

// 注册模板（模板绑定到 Provider）
reach.template.register({
  name: 'welcome_email',
  provider: 'email',
  subject: '欢迎 {userName}',
  body: '亲爱的 {userName}，欢迎使用 {appName}！',
})

reach.template.register({
  name: 'sms_code',
  provider: 'sms',
  body: '验证码: {code}，{minutes} 分钟内有效。',
})

// 通过 provider 字段选择发送渠道
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  template: 'welcome_email',
  vars: { userName: '张三', appName: 'Hai' },
})

// 发送短信（指定 provider）
await reach.send({
  provider: 'sms',
  to: '13800138000',
  templateCode: 'SMS_123456',
  vars: { code: '123456' },
})

// 直接发送（无模板）
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  subject: '通知',
  body: '这是一封通知邮件。',
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

## 错误处理

所有操作返回 `Result<T, ReachError>`，错误码定义在 `ReachErrorCode`：

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
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
