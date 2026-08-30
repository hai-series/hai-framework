# 模块审查与分批修复（2026-08-30）

范围：检索 21 个 packages 的入口、生命周期、错误处理和模板引用；重点深入 AI/A2A/MCP、Kit、CLI、Cache。不是对所有模块每一行的形式化验证。每类修复独立提交，未实测项不计作通过。

## 问题清单

| #   | 优先级 | 类别 / 定位                       | 问题与影响                                                              | 状态   |
| --- | ------ | --------------------------------- | ----------------------------------------------------------------------- | ------ |
| 1   | P1     | Kit `kit-a2a-helpers/handle` 认证 | API Key 校验失败返回 null 后仍执行请求，认证未 fail-closed              | 已修复 |
| 2   | P2     | AI `getAgentCard`                 | 对外返回简化配置而非完整协议 Card，客户端无法发现版本/能力/安全方案     | 已修复 |
| 3   | P2     | Kit `resolveA2AConfig`            | 默认发现路径 agent.json 与 A2A 0.3 agent-card.json 不一致               | 已修复 |
| 4   | P2     | AI `buildAgentCard`               | MIME 写成 text 且没有声明已支持的 streaming，能力协商错误               | 已修复 |
| 5   | P1     | AI `handleRequest`                | 丢弃认证上下文，executor 收不到调用主体                                 | 已修复 |
| 6   | P2     | AI A2A 延迟代理                   | 未初始化返回 HaiResult 却强转 never，HTTP 层读取 body 得到空响应        | 已修复 |
| 7   | P1     | AI `wrapExecutorWithLogging`      | Object.create(EventTarget) 伪造 receiver，finished 等原生方法可能异常   | 已修复 |
| 8   | P2     | Kit A2A JSON 解析                 | 非法 JSON 直接抛错而非 JSON-RPC -32700                                  | 已修复 |
| 9   | P1     | Kit A2A SSE                       | start 无界读取、没有 cancel 清理，断开连接后继续消费                    | 已修复 |
| 10  | P3     | Kit A2A 重复实现/注释/i18n        | Hook 和路由重复协议逻辑，匿名认证注释及硬编码错误不同步                 | 已修复 |
| 11  | P1     | AI MCP `callTool`                 | 声明的 JSON Schema 未校验，非法参数进入 handler                         | 待修复 |
| 12  | P2     | AI MCP `getPrompt`                | in 运算符把继承属性当作必填参数，且未校验字符串类型                     | 待修复 |
| 13  | P2     | AI MCP `readResource`             | text/blob 可同时缺失或同时存在，未校验 handler 输出                     | 待修复 |
| 14  | P2     | AI MCP Prompt 类型                | 自建内容类型缺少协议的 image/audio 等，且允许缺失 text/resource         | 待修复 |
| 15  | P2     | AI MCP 请求上下文                 | 传入不含 requestId 的 context 后不会自动补 UUID，与注释不符             | 待修复 |
| 16  | P3     | AI MCP 空抽象                     | MCPProvider 重复 MCPOperations，AIMCPFunctionsDeps 配置从未读取         | 待修复 |
| 17  | P1     | CLI `generate` 名称               | 只检查 outputDir，name 含路径分隔符仍可逃逸或注入生成代码               | 待修复 |
| 18  | P1     | CLI `generate` 覆盖               | force 参数没有传到写文件路径，默认也覆盖已有文件                        | 待修复 |
| 19  | P2     | CLI `generateApi`                 | POST 不做 Schema 校验，非法 JSON 被笼统转换为 500，且 body 声明后未使用 | 待修复 |
| 20  | P2     | CLI `generateMigration`           | 导入已不存在的 MigrationFn 并调用 db.run，生成文件无法编译              | 待修复 |
| 21  | P2     | CLI `generateComponent`           | $props 与旧 slot 混用，未使用 Svelte 5 children Snippet 模式            | 待修复 |
| 22  | P2     | CLI `generatePage`                | 空骨架解构未使用 locals/request，生成后 lint 报错                       | 待修复 |
| 23  | P2     | Cache 内存 `isExpired`            | 恰好到期时仍有效，与 TTL 边界不符                                       | 待修复 |
| 24  | P2     | Cache 内存计数器                  | Number(null/boolean/array) 被当数值，NaN/Infinity 增量破坏计数值        | 待修复 |
| 25  | P2     | Cache 内存 `hgetall`              | 普通对象赋值 **proto** 无法保留合法字段，返回结果缺失                   | 待修复 |

## 协议覆盖与边界

- A2A 按当前依赖 SDK 0.3.12 / 协议 0.3 审查，不宣称升级到其他协议版本。[官方规范](https://a2a-protocol.org/v0.3.0/specification/)
- 支持 JSON-RPC 与 SSE；push notifications 未配置 sender/store，明确不声明支持；gRPC/REST 不在当前封装范围。认证上下文 agentId 映射 SDK user；任务资源归属和业务权限仍需独立审查，不能将有认证等同于完整授权。
- MCP 独立服务器委托官方 SDK；ai.mcp 是进程内注册/调用接口，不自动绑定 createMcpServer 的 transport，也不是完整 MCP client。[Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)、[Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)

## 验证记录

- 修改前：根 typecheck 42/42 任务通过。
- A2A：AI 定向 24/24、Kit 定向 13/13；覆盖真实 SDK 执行与 HTTP 请求，不访问外部 AI provider。
- 后续各类门禁、根门禁、生成项目 E2E 在实际执行后追加。
