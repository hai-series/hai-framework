---
name: hai-serv
description: "为独立 API 服务装配 contract/procedures、认证守卫、Node/Fetch、OpenAPI 与语音 WebSocket。"
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

- 先确定 Node listen 还是 Fetch adapter，再从共享 contract 装配 procedures；不要直接暴露 Hono。Node 自动提供 socket 对端；Fetch 通过 app.fetch 的 remoteAddress 元数据提供可信平台对端。http.trustedProxies 默认为空，仅显式代理 IP/CIDR 可以提供转发头；自定义 context 传递完整 input 保留解析后的 ip。
- Storage 默认 procedures 必须注入 authorize 资源策略，使用可信 session 校验全部 key/prefix；缺失策略默认拒绝，混合批量全量授权后才执行。
- AI 默认 feature 以可信 session.userId 绑定 objectId，所有读写和记忆按主体隔离；跨主体访问必须显式 authorizeObject，同名 sessionId 不代表同一用户。
- 认证绑定 route 的 auth/permission/role；启动配置错误与正常请求领域错误分别处理。
- 普通 procedure 的失败 HaiResult 默认通过 HTTP 200 返回，必须检查 success 与 error.code；error.httpStatus 是领域错误元数据。contract 输入校验失败为 HTTP 400，HTTP middleware、刷新 cookie 等响应另按自身契约处理，不能混为同一种状态映射。
- 浏览器 Cookie、CORS、apiPrefix、transport 须与 api-client 同步；语音 ticket 单独核验。
- 缺失路由返回本地化 HaiResult JSON 404；加密传输保留该状态。默认 feature 可按需选用，contract 与挂载的 procedures 保持一致。

## 按需参考

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

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
