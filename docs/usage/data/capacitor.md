# capacitor 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/capacitor.md) · [功能说明](../function/capacitor.md)

## 数据库与缓存

模块没有共享数据库表或 Redis 键。推送 token 由系统或插件返回，应用负责服务端登记和清理。

## 设备存储

| 键                          | 值                                    | 默认值与生命周期                          |
| --------------------------- | ------------------------------------- | ----------------------------------------- |
| `hai_access_token`          | 原生安全存储中的 access token 字符串  | 缺失时读取为空，由 token 适配器写入或清除 |
| `hai_refresh_token`         | 原生安全存储中的 refresh token 字符串 | 缺失时读取为空，由 token 适配器写入或清除 |
| 调用方提供的 Preferences 键 | 应用自行解释的普通字符串              | 缺失时读取为空，按键覆盖或删除，无 TTL    |

认证凭据由 Android KeyStore 支持的加密偏好存储或 iOS Keychain 管理。Web 没有原生 token 存储回退。各适配器使用同一组设备键，服务端会话由 [IAM](iam.md) 管理。
