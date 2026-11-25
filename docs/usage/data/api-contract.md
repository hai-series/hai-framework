# @h-ai/api-contract 数据结构

<a id="api-contract-数据结构"></a>

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/api-contract.md) · [功能说明](../function/api-contract.md)

登录表单通过契约知道要发送哪些字段，并从公开配置响应读取当前允许的登录方式。端点和结构定义随应用代码发布，用户会话和业务记录由相应模块保存。

<a id="response-data"></a>

## 接口数据

一条接口定义包含 HTTP 方法、路径，以及路径参数、查询参数、请求正文和响应的校验规则。TypeScript 类型、API 文档和客户端代码从同一份定义读取这些信息。省略请求字段时，按该字段的接口规则填默认值。数据库列的默认值由 [IAM](iam.md) 等写入业务数据的模块定义。

<a id="example-data"></a>

### 接口承诺返回的业务数据

登录表单调用 `apiContract.iam.auth.sendOtp` 对应的 `POST /auth/otp/send` 后，用成功响应的到期时间更新输入区。HTTP JSON 使用 UTC 日期时间字符串。

```json
{
  "success": true,
  "data": {
    "expiresAt": "2026-05-20T10:05:00.000Z"
  }
}
```

示例中服务端接受了发送请求，验证码的到期时间为 10:05 UTC。会话登录还要调用 OTP 登录接口，由 IAM 校验用户输入的验证码。

用户、角色、权限的 `createdAt` / `updatedAt` 和 OTP 的 `expiresAt` 都是必填日期。Zod Schema 接受有效 `Date` 或带时区的 ISO 日期时间字符串，`null` 校验失败。服务端发送 JSON 时这些值为 ISO 字符串，API Client 校验后仍保留字符串。用户的可空 `accountExpiresAt` 在更新时可用 `null` 清除期限。

<a id="public-settings"></a>

### 公开配置响应

#### 响应来源

应用用 `apiContract.create()` 选出要提供的接口。服务端照这份接口定义写处理函数，客户端用同一份定义检查调用参数，并知道结果里有哪些字段。接口定义也规定登录页能收到哪些设置，例如验证码是否开启。密码规则、注册方式和会话时间在服务端的 [IAM 配置](../configuration/iam.md) 中设置。

#### 响应字段

| 字段                                     | 默认值/必填          | 说明                                                                                        |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| `IamPublicConfigSchema.captcha`            | `{ enabled: false }` | 是否展示并提交验证码证明                                                                    |
| `IamPublicConfigSchema.reauthentication`   | 可省略               | 可公开的再认证开关及操作标识列表                                                            |
| `IamPublicConfigSchema.initialCredentials` | 可省略               | 初始凭据流程开关                                                                            |
| `IamPublicConfigSchema.password`           | 响应必填             | 可公开的密码长度、字符类别、有效期及改密要求                                                |
| `IamPublicConfigSchema.register`           | 响应必填             | 注册入口的 `enabled` 开关                                                                   |
| `IamPublicConfigSchema.login`              | 响应必填             | `password`、`otp`、`ldap`、`email`、`sms` 五项登录渠道开关                                  |
| `IamPublicConfigSchema.passwordReset`      | 响应必填             | 重置开关及 `email` 或 `phone` 模式                                                          |
| `IamPublicConfigSchema.otp`                | 响应必填             | 展示用验证码长度和再次发送间隔                                                              |
| `IamPublicConfigSchema.agreements`         | 响应必填             | 用户协议和隐私政策，支持 Markdown 或 URL，随登录或注册表单展示                              |
| `IamPublicConfigSchema.ui`                 | 响应必填             | `variant` 为 `card` 或 `split`。可设置标题、副标题、品牌、Logo 及插画字段                   |
| `IamPublicConfigSchema.session`            | 响应必填             | `maxAge` 为会话有效期，`endOnPageHide` 默认 `false`                                         |

#### 使用与核对

标准登录页可调用 `apiClient.iam.auth.publicConfig()`，把成功返回的 `data` 交给 `AuthPanel` 的 `config` 属性。例如关闭 IAM 注册后，登录页应随响应隐藏注册入口，服务端也应拒绝该注册请求。[IAM 服务端配置](../configuration/iam.md) · [API 客户端配置](../configuration/api-client.md)

<a id="登录页面可以看到的策略"></a>

#### 示例 · 登录页面可以看到的策略

服务端把允许公开的登录策略返回给页面，页面据此显示注册、登录和验证码入口。

```json
{
  "captcha": {
    "enabled": false
  },
  "register": {
    "enabled": true
  },
  "login": {
    "password": true,
    "otp": false,
    "ldap": false,
    "email": true,
    "sms": false
  },
  "session": {
    "maxAge": 86400,
    "endOnPageHide": false
  }
}
```

此例开放注册、允许密码登录、未启用验证码；只展示部分字段。它不含密钥，也不代替服务端再次执行登录限制。
