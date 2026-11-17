# capacitor 数据结构

[English](capacitor.en.md) · [日本語](capacitor.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/capacitor.md) · [功能说明](../function/capacitor.md)

## 数据库与缓存

模块没有共享数据库表或 Redis 键。推送插件返回设备推送令牌。应用需要把该令牌登记到自己的服务端，并在解绑设备或注销账号时清理登记。

## 设备存储

| 键                          | 值                                    | 默认值与生命周期                          |
| --------------------------- | ------------------------------------- | ----------------------------------------- |
| `hai_access_token`          | 原生安全存储中的 access token 字符串  | 缺失时读取为空，由 token 适配器写入或清除 |
| `hai_refresh_token`         | 原生安全存储中的 refresh token 字符串 | 缺失时读取为空，由 token 适配器写入或清除 |
| 调用方提供的 Preferences 键 | 应用自行解释的普通字符串              | 缺失时读取为空，按键覆盖或删除，无 TTL    |

`createCapacitorTokenStorage()` 在 Android 使用由系统密钥库保护的加密存储，在 iOS 使用 Keychain。该入口用于原生应用，浏览器使用适合 Web 的客户端存储。创建多个原生存储对象时，它们仍读写这两个相同的设备键。令牌对应的服务端会话由 [IAM](iam.md) 管理。
