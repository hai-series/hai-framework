---
name: hai-serv
description: "为独立 API 服务装配 contract/procedures、认证守卫、Node/Fetch、OpenAPI 与语音 WebSocket。"
---

# hai-serv

transport 仅支持 v2：SM2 发送方签名、独立密钥的 Encrypt-then-HMAC、HTTP 上下文/响应状态绑定及共享原子防重放。GET/HEAD、空 POST 与空响应也认证；无降级开关。TLS 信任边界、5 分钟窗口、nonce 持久化与实现示例见 [参考](reference.md)。

## 能力契约

| 项目     | 契约                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 能力     | 使用 @h-ai/serv 装配 contract/procedures、认证守卫、OpenAPI、HTTP 与语音 WebSocket                                      |
| 适用场景 | 独立 HTTP 服务装配、请求守卫或运行时适配                                                                                |
| 输入     | contract、procedures、已初始化 features、ServConfigInput                                                                |
| 输出     | HTTP App、Node listener 或 Fetch handler                                                                                |
| 限制     | 无 init/close；createApp 配置错误可抛出。依赖先初始化，onClose 反序释放。Hono 为内部实现，业务授权由 route guard 执行。 |

容量通过 resolveTransportBodyLimits(explicitLimit, { requiredPlaintextBytes }) 合并：省略/auto 才按模块需求推导，显式整数不足时报错，不得静默取大或覆盖。Serv/Kit auto 解析为 undefined；部署代理和 BODY_SIZE_LIMIT 与运行时复用同一结果，反馈业务预算独立。

## 使用路径

- 在满足包 Node API 依赖的宿主中选择 listen 或标准 Fetch adapter，再从共享 contract 装配 procedures；不要直接暴露 Hono。Node 自动提供 socket 对端；Fetch 通过 app.fetch 的 remoteAddress 元数据提供可信平台对端。http.trustedProxies 默认为空，仅显式代理 IP/CIDR 可以提供转发头；自定义 context 传递完整 input 保留解析后的 ip。
- Storage 默认 procedures 必须注入 authorize 资源策略，使用可信 session 校验全部 key/prefix；缺失策略默认拒绝，混合批量全量授权后才执行。
- AI 默认 feature 以可信 session.userId 绑定 objectId，所有读写和记忆按主体隔离；跨主体访问必须显式 authorizeObject，同名 sessionId 不代表同一用户。
- 认证绑定 route 的 auth/permission/role；启动配置错误与正常请求领域错误分别处理。
- 普通 procedure 的失败 HaiResult 默认通过 HTTP 200 返回，必须检查 success 与 error.code；error.httpStatus 是领域错误元数据。contract 输入校验失败为 HTTP 400，HTTP middleware、刷新 cookie 等响应另按自身契约处理，不能混为同一种状态映射。
- 浏览器 Cookie、CORS、apiPrefix、transport 须与 api-client 同步；语音 ticket 单独核验。
- transport 服务端显式注入受管 serverKeyRing 和共享 keyStore；请求带协商 serverKeyId。私钥只从 Secret/私有环境加载，不放公开配置；轮换、重启与跨节点要求见 hai-crypto。
- 缺失路由返回本地化 HaiResult JSON 404；加密传输保留该状态。默认 feature 可按需选用，contract 与挂载的 procedures 保持一致。

传输加密按实际请求/响应 body 判断空正文，不信任 Content-Type/Length；非空明文不能借缺头、chunked 或伪造零长度旁路，实际空流保留无 input POST 行为。

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；resolveTransportBodyLimits 自动推导密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 通过 _serv.yml 的 transport.maxPlaintextBytes 或对应 HAI_*_TRANSPORT_MAXPLAINTEXTBYTES 配置并转发到服务端 transport；重建正文保留 signal 并删除旧长度/编码头。

错误提示与诊断分离：HTTP/UI 边界用 core.error.toPublic，仅公开 i18n 安全消息及 error.traceId；重新翻译后用 core.error.formatMessage 保留关联。ToastContainer 默认只显示可读说明，自动将编号移入排查信息图标，展开后可查看、复制并提供给客户支持或开发人员。前后端日志传完整 Error 和操作上下文，使用同一 requestId/traceId 并脱敏；禁止只写通用错误标题，也不能把 cause/ext/SQL/绑定值直接返回用户。数据库日志保留安全的驱动错误码、消息和堆栈。

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

标准登出入口 `auth.logout` 从 input.accessToken 或 Authorization Bearer 取得要撤销的完整令牌，不要求 access 仍有效。它不接受 userId 授权或撤销目标；缺少令牌返回失败，未知令牌幂等成功。共享存储故障原样保留失败 HaiResult，Cookie middleware 只对成功结果清理 refresh Cookie。普通 procedure 继续使用既有 HTTP 200 / HaiResult 协议，客户端必须检查 success，不能只检查状态码。

JSDoc 公开例子按实际根入口/features 声明编译；“模块内部上下文”不能照抄为根 API。工厂配置异常、领域 HaiResult 与 HTTP middleware 的状态分别处理；listener.close 仅关闭 HTTP，onClose 为信号关闭回调，业务资源仍由宿主管理。

使用 toFetch 注入时，Request 输入同样应用 RequestInit 覆盖，并按标准构造器拒绝非法/已消费/锁定正文；取消会停止派发或响应等待并传给应用，不回滚副作用。Response 交付后的流由应用监听 request.signal 清理。
