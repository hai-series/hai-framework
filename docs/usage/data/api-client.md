# api-client 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/api-client.md) · [功能说明](../function/api-client.md)

## 数据库与缓存

客户端没有 SQL 表或 Redis 键。会话的持久状态由 [IAM](iam.md) 管理。

## 客户端存储

| 存储方式                   | 数据                                                                                                      | 生命周期                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `httpOnlyCookie()`（默认） | access token 保存在适配器内存。refresh 读取返回 Cookie 模式标记，供客户端决定是否发送带 Cookie 的刷新请求 | access 初始为空，刷新页面后丢失。refresh Cookie 由 [serv](serv.md) 管理                 |
| `memory()`                 | 适配器独立持有 access 和 refresh token                                                                    | 初始为空，清除或销毁实例后失效。服务端按请求或会话创建适配器                            |
| 自定义 `TokenStorage`      | 实现 access 和 refresh token 的读写和清除                                                                 | 原生设备可用 [capacitor](capacitor.md) 的安全存储。默认浏览器适配器没有 localStorage 键 |
