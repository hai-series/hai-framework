# API Contract 配置

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

[配置手册](README.md)

## 配置入口

应用用 `apiContract.create()` 选出要提供的接口。服务端照这份接口定义写处理函数，客户端用同一份定义检查调用参数，并知道结果里有哪些字段。接口定义也规定登录页能收到哪些设置，例如验证码是否开启。密码规则、注册方式和会话时间在服务端的 [IAM 配置](iam.md) 中设置。

## 配置示例

```ts
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
```

## 配置清单

| 配置项                                     | 默认值/必填          | 说明                                                                                        |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| `apiContract.create(domains)`              | 由应用选择           | 传入领域名到契约的映射，包含 `iam`、`storage`、`ai`、`feedback`、`payment` 或应用自定义领域 |
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

## 生效与核对

标准登录页可调用 `apiClient.iam.auth.publicConfig()`，把成功返回的 `data` 交给 `AuthPanel` 的 `config` 属性。例如关闭 IAM 注册后，登录页应随响应隐藏注册入口，服务端也应拒绝该注册请求。[IAM 服务端配置](iam.md) · [API 客户端配置](api-client.md)
