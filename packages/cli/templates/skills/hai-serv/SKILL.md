---
name: hai-serv
description: "使用 @h-ai/serv 装配 contract/procedures、认证守卫、OpenAPI、HTTP 与语音 WebSocket。"
---

# hai-serv

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/serv 装配 contract/procedures、认证守卫、OpenAPI、HTTP 与语音 WebSocket |
| 适用场景 | 独立 HTTP 服务装配、请求守卫或运行时适配 |
| 输入 | contract、procedures、已初始化 features、ServConfigInput |
| 输出 | HTTP App、Node listener 或 Fetch handler |
| 限制 | 无 init/close；createApp 配置错误可抛出。依赖先初始化，onClose 反序释放。Hono 为内部实现，业务授权由 route guard 执行。 |

## 使用路径

- 先确定 Node listen 还是 Fetch adapter，再从共享 contract 装配 procedures；不要直接暴露 Hono。
- 认证绑定 route 的 auth/permission/role；启动配置错误与正常请求领域错误分别处理。
- 浏览器 Cookie、CORS、apiPrefix、transport 须与 api-client 同步；语音 ticket 单独核验。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- HTTP 配置（`ServHttpConfigInput`）
- Feature Procedures（默认实现）
- 常见模式
- 错误码
- httpOnly Cookie 认证
- 测试
