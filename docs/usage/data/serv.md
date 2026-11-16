# serv 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/serv.md) · [功能说明](../function/serv.md)

## 数据库与缓存

HTTP 路由、请求校验和错误处理中间件没有自己的数据库表或 Redis 键。认证、审计、对象或向量由 [IAM](iam.md)、[audit](audit.md)、[storage](storage.md)、[AI](ai.md) 等模块持有，限流复用 [kit](kit.md)。

## Cookie 和请求上下文

| 数据                | 默认值与用途                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_refresh_token` | 启用 refresh Cookie 后写入编码的 refresh token。默认 30 天，Path 指向部署 API 前缀下的刷新路由，带 HttpOnly、SameSite=Strict 和按环境或配置启用的 Secure |
| Cookie 清除         | 以相同键和 Path 写空值，设置 Max-Age=0                                                                                                                   |
| 原生认证响应        | 启用并验证原生 token 传输后，响应数据可以携带 token，设备保存见 [capacitor](capacitor.md)                                                                |
| 请求上下文          | 当前请求的身份、语言、追踪和中间件结果，随请求结束释放                                                                                                   |
