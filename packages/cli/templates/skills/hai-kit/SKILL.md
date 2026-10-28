---
name: hai-kit
description: "在 SvelteKit 中接入 hooks、认证守卫、输入校验、响应和同源加密客户端；不用于独立 serv 服务。"
---

# hai-kit

限流采用首次成功提交为起点的固定窗口，后续请求不延长 TTL。必须显式传 store；应用先检查共享 Redis 初始化结果，所有节点使用相同 namespace/windowMs/maxRequests。缓存读取/条件提交失败或冲突耗尽返回503，超限429；不会回退 get+set 或本地计数。createMemoryRateLimitStore 仅开发或显式 HAI_E2E/HAI_E2E_MOCK 测试使用，无常驻定时器，丢弃引用即可回收；每次请求最多惰性扫描 64 项，最多保存 10000 个窗口，容量满时对新 key 返回503且不驱逐有效计数，外部 store 生命周期由创建者管理；生产不得设置测试开关。响应重置时间为节点时钟估算，实际窗口由 Redis TTL 决定，须同步时钟。默认键只读取可信 adapter 的 getClientAddress、规范化等价IPv6和IPv4映射地址，不采信原始转发头；代理信任通过部署adapter配置。

transport 仅支持 v2：SM2 发送方签名、独立密钥的 Encrypt-then-HMAC、HTTP 上下文/响应状态绑定及共享原子防重放。GET/HEAD、空 POST 与空响应也认证；无降级开关。TLS 信任边界、5 分钟窗口、nonce 持久化与实现示例见 [参考](reference.md)。

## 能力契约

| 项目     | 契约                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 能力     | 使用 @h-ai/kit 集成 SvelteKit hooks、守卫、校验、响应及同源客户端传输                                   |
| 适用场景 | SvelteKit hooks、load 和同源端点集成                                                                    |
| 输入     | SvelteKit handle/RequestEvent、schema、guard、transport                                                 |
| 输出     | handle、Response、校验值和客户端请求结果                                                                |
| 限制     | 无 init/close；保留 SvelteKit 控制流异常。跨端共享 HTTP contract 用 api-contract + serv，勿复制到 kit。 |

容量通过 resolveTransportBodyLimits(explicitLimit, { requiredPlaintextBytes }) 合并：省略/auto 才按模块需求推导，显式整数不足时报错，不得静默取大或覆盖。Serv/Kit auto 解析为 undefined；部署代理和 BODY_SIZE_LIMIT 与运行时复用同一结果，反馈业务预算独立。

## 使用路径

1. 仅在 SvelteKit 集成；先查现有 hooks、配置、守卫与路由，不将其套用于独立 serv 应用。
2. 用 createHandle 编排已初始化模块；认证 API 与公开路径复用 kit.auth，客户端复用框架动作。
3. 区分返回 HaiResult 的业务操作与抛 Response/redirect/error 的框架控制流，不吞掉控制流。
4. 对齐 Cookie/CSRF/transport 与服务端配置，验证匿名、登录、权限拒绝和表单失败。

默认请求日志支持 prerender：查询应从独立 `new URL(event.request.url)` 读取，路径保留 `event.url.pathname`，不为观测读取跟踪 URL 的 search/searchParams 而建立页面依赖或触发静态构建错误。保持默认日志开启、JSON 正文日志默认关闭；查询/可选正文先脱敏再写 trace，正文读取副本，不能消耗业务请求。页面业务确实依赖查询时仍按 SvelteKit 的动态路由条件处理，不用日志绕过来声明业务可静态生成。

Kit 自动请求审计与 Serv 一样，仅在请求时发现 audit.isInitialized 才写入；未选 Audit 的站点不因默认 handle 产生未初始化错误。选择 Audit 时检查 init 结果并失败停止启动；显式业务审计仍遵守初始化和事务合同，已就绪模块写入失败必须保留诊断，不能当作可选模块静默跳过。handle 创建早于模块初始化时不能在装配阶段把审计永久禁用。

服务端 transport 使用含受管 serverKeyRing、共享 keyStore 的对象，不再接受单独 true。公开 _kit.yml 只保留路径/开关，不放私钥；浏览器无 ring。请求携带协商 serverKeyId，各节点同 ring + registry，不依赖粘性路由；轮换见 hai-crypto。

传输加密按实际请求/响应 body 判断空正文，不信任 Content-Type/Length；非空明文不能借缺头、chunked 或伪造零长度旁路，实际空流保留无 input POST 行为。

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；resolveTransportBodyLimits 自动推导密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 通过 _kit.yml 的 transport.maxPlaintextBytes 或对应 HAI_*_TRANSPORT_MAXPLAINTEXTBYTES 配置并转发到服务端 transport；重建正文保留 signal 并删除旧长度/编码头。

错误提示与诊断分离：HTTP/UI 边界用 core.error.toPublic，仅公开 i18n 安全消息及 error.traceId；重新翻译后用 core.error.formatMessage 保留关联。ToastContainer 默认只显示可读说明，自动将编号移入排查信息图标，展开后可查看、复制并提供给客户支持或开发人员。前后端日志传完整 Error 和操作上下文，使用同一 requestId/traceId 并脱敏；禁止只写通用错误标题，也不能把 cause/ext/SQL/绑定值直接返回用户。数据库日志保留安全的驱动错误码、消息和堆栈。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [常见模式](reference.md#常见模式)
- [声明式 CRUD 表单字段](reference.md#声明式-crud-表单字段)

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。

认证 Cookie 在 NODE_ENV 或 HAI_CORE_ENV 为 production 时默认启用 Secure，HAI_E2E/HAI_E2E_MOCK 不降低 Cookie 安全；限流生产判断也识别这两个环境标志，测试开关仅放宽共享状态要求。

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。
