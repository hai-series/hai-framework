# 模块审查与分批修复（2026-08-30）

范围：检索 21 个 packages 的入口、生命周期、错误处理和模板引用；重点深入 AI/A2A/MCP、Kit、CLI、Cache。不是对所有模块每一行的形式化验证。每类修复独立提交，未实测项不计作通过。

## 问题清单

| #   | 优先级 | 类别 / 定位                       | 问题与影响                                                                             | 状态   |
| --- | ------ | --------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| 1   | P1     | Kit `kit-a2a-helpers/handle` 认证 | API Key 校验失败返回 null 后仍执行请求，认证未 fail-closed                             | 已修复 |
| 2   | P2     | AI `getAgentCard`                 | 对外返回简化配置而非完整协议 Card，客户端无法发现版本/能力/安全方案                    | 已修复 |
| 3   | P2     | Kit `resolveA2AConfig`            | 默认发现路径 agent.json 与 A2A 0.3 agent-card.json 不一致                              | 已修复 |
| 4   | P2     | AI `buildAgentCard`               | MIME 写成 text 且没有声明已支持的 streaming，能力协商错误                              | 已修复 |
| 5   | P1     | AI `handleRequest`                | 丢弃认证上下文，executor 收不到调用主体                                                | 已修复 |
| 6   | P2     | AI A2A 延迟代理                   | 未初始化返回 HaiResult 却强转 never，HTTP 层读取 body 得到空响应                       | 已修复 |
| 7   | P1     | AI `wrapExecutorWithLogging`      | Object.create(EventTarget) 伪造 receiver，finished 等原生方法可能异常                  | 已修复 |
| 8   | P2     | Kit A2A JSON 解析                 | 非法 JSON 直接抛错而非 JSON-RPC -32700                                                 | 已修复 |
| 9   | P1     | Kit A2A SSE                       | start 无界读取、没有 cancel 清理，断开连接后继续消费                                   | 已修复 |
| 10  | P3     | Kit A2A 重复实现/注释/i18n        | Hook 和路由重复协议逻辑，匿名认证注释及硬编码错误不同步                                | 已修复 |
| 11  | P1     | AI MCP `callTool`                 | 声明的 JSON Schema 未校验，非法参数进入 handler                                        | 已修复 |
| 12  | P2     | AI MCP `getPrompt`                | in 运算符把继承属性当作必填参数，且未校验字符串类型                                    | 已修复 |
| 13  | P2     | AI MCP `readResource`             | text/blob 可同时缺失或同时存在，未校验 handler 输出                                    | 已修复 |
| 14  | P2     | AI MCP Prompt 类型                | 自建内容类型缺少协议的 image/audio 等，且允许缺失 text/resource                        | 已修复 |
| 15  | P2     | AI MCP 请求上下文                 | 传入不含 requestId 的 context 后不会自动补 UUID，与注释不符                            | 已修复 |
| 16  | P3     | AI MCP 空抽象                     | MCPProvider 重复 MCPOperations，AIMCPFunctionsDeps 配置从未读取                        | 已修复 |
| 17  | P1     | CLI `generate` 名称               | 只检查 outputDir，name 含路径分隔符仍可逃逸或注入生成代码                              | 已修复 |
| 18  | P1     | CLI `generate` 覆盖               | force 参数没有传到写文件路径，默认也覆盖已有文件                                       | 已修复 |
| 19  | P2     | CLI `generateApi`                 | POST 不做 Schema 校验，非法 JSON 被笼统转换为 500，且 body 声明后未使用                | 已修复 |
| 20  | P2     | CLI `generateMigration`           | 导入已不存在的 MigrationFn 并调用 db.run，生成文件无法编译                             | 已修复 |
| 21  | P2     | CLI `generateComponent`           | $props 与旧 slot 混用，未使用 Svelte 5 children Snippet 模式                           | 已修复 |
| 22  | P2     | CLI `generatePage`                | 空骨架解构未使用 locals/request，生成后 lint 报错                                      | 已修复 |
| 23  | P2     | Cache 内存 `isExpired`            | 恰好到期时仍有效，与 TTL 边界不符                                                      | 已修复 |
| 24  | P2     | Cache 内存计数器                  | Number(null/boolean/array) 被当数值，NaN/Infinity 增量破坏计数值                       | 已修复 |
| 25  | P2     | Cache 内存 `hgetall`              | 普通对象赋值 **proto** 无法保留合法字段，返回结果缺失                                  | 已修复 |
| 26  | P1     | AI A2A TaskStore                  | tasks/get 按 taskId 全局读取，没有限制调用主体，可跨调用方访问任务                     | 已修复 |
| 27  | P2     | AI A2A listMessages               | callerId、contextId、since 参数未真正作用于查询，消息缺失 caller/context 信息          | 已修复 |
| 28  | P1     | AI A2A 初始化                     | executor 延迟注册时才创建 Store，已错过 Provider.initialize，持久化表未建立            | 已修复 |
| 29  | P1     | AI RelStore 错误处理              | SQL HaiResult 失败被当作成功写入、空查询或任务不存在，掩盖数据库故障                   | 已修复 |
| 30  | P2     | 数据库集成测试就绪策略            | Podman 下容器内部端口 exec 等待挂起，MySQL 广泛日志匹配又可能提前接受临时服务器        | 待验证 |
| 31  | P1     | AI RelStore MySQL 索引            | 使用 MySQL 8 不支持的 CREATE INDEX IF NOT EXISTS，索引缺失且修正错误传播后会阻断初始化 | 已修复 |

## 协议覆盖与边界

- A2A 按当前依赖 SDK 0.3.12 / 协议 0.3 审查，不宣称升级到其他协议版本。[官方规范](https://a2a-protocol.org/v0.3.0/specification/)
- 支持 JSON-RPC 与 SSE；push notifications 未配置 sender/store，明确不声明支持；gRPC/REST 不在当前封装范围。认证上下文 agentId 映射 SDK user；任务读取按主体隔离，匿名请求共享匿名作用域；业务权限仍由应用负责，不能将有认证等同于完整授权。旧任务需应用审核后迁移归属，框架不自动推断或删除历史数据。
- MCP 独立服务器委托官方 SDK；ai.mcp 是进程内注册/调用接口，不自动绑定 createMcpServer 的 transport，也不是完整 MCP client。[Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)、[Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)

## 验证记录

- 修改前：根 typecheck 42/42 任务通过。
- A2A：AI 定向 24/24、Kit 定向 13/13；覆盖真实 SDK 执行与 HTTP 请求，不访问外部 AI provider。
- MCP：27/27，含官方 SDK Client/Server 内存 transport 的 initialize、工具、资源、提示词和关闭链路。
- Cache：9 文件 233/233（内存 + Podman Redis），含精确到期、计数器拒绝非法值、特殊 Hash 字段。
- A2A 与 RelStore 追加测试：34/34，覆盖真实 SQLite 持久化、调用方隔离、消息过滤、SQL 故障传播；MySQL 索引幂等先以 SQL 单元测试验证。[MySQL 8 索引语法](https://dev.mysql.com/doc/refman/8.0/en/create-index.html)
- 后续根门禁、生成项目 E2E 在实际执行后追加。
- CLI：7 文件 252 项通过；6 项真实脚手架门禁默认跳过，本轮单独运行 admin 场景，通过 install/typecheck/lint/build/test/test:e2e。该场景实际生成 page/component/api/model/migration；单元测试 4/4（含迁移 up/query/down），浏览器首页 E2E 1/1。其他五类应用的完整安装及浏览器门禁本轮未重跑，不将静态生成断言当作运行验收。
