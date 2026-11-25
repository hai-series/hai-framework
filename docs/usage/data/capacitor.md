# @h-ai/capacitor 数据结构

<a id="capacitor-数据结构"></a>

[English](capacitor.en.md) · [日本語](capacitor.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/capacitor.md) · [功能说明](../function/capacitor.md)

移动应用把登录凭据写入设备的安全存储，之后可以恢复会话。上次打开的页签等普通偏好另由设备偏好存储管理。

<a id="device-storage"></a>

## 设备存储

模块没有共享数据库表或 Redis 键。推送插件返回设备推送令牌。应用需要把该令牌登记到自己的服务端，并在解绑设备或注销账号时清理登记。

| 键                          | 值                                    | 默认值与生命周期                          |
| --------------------------- | ------------------------------------- | ----------------------------------------- |
| `hai_access_token`          | 原生安全存储中的 access token 字符串  | 缺失时读取为空，由 token 适配器写入或清除 |
| `hai_refresh_token`         | 原生安全存储中的 refresh token 字符串 | 缺失时读取为空，由 token 适配器写入或清除 |
| 调用方提供的 Preferences 键 | 应用自行解释的普通字符串              | 缺失时读取为空，按键覆盖或删除，无 TTL    |

`capacitor.createTokenStorage()` 在 Android 使用由系统密钥库保护的加密存储，在 iOS 使用 Keychain。该入口用于原生应用，浏览器使用适合 Web 的客户端存储。创建多个原生存储对象时，它们仍读写这两个相同的设备键。令牌对应的服务端会话由 [IAM](iam.md) 管理。

<a id="example-data"></a>

### 设备的访问凭据

原生应用从安全存储取出此凭据，调用需要登录的接口。

```json
"<access-token:redacted>"
```

这里是键和值的示意，真实令牌已隐藏。退出时由凭据适配器清除，服务端会话是否有效仍由 IAM 判断。

### 设备用来续期的凭据

访问凭据到期时，原生应用可用它向服务端申请新令牌，不需要每次都让用户重新输入密码。

```json
"<refresh-token:redacted>"
```

值保存在平台安全存储中，不是普通 Preferences；没有本地 TTL 不等于永远能用，服务端仍会使它失效。

### 设备记住的普通偏好

Preferences 适合保存不敏感的界面选项，应用自己命名、修改和删除。

```json
"orders"
```

orders 表示下次打开时优先展示订单标签页。这个键由示例业务定义，不是框架内置认证状态。
