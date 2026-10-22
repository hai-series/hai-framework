# 模块代码风格清单

本清单记录 21 个框架包的命名与导出边界。规则正文见[模块规范](../.agents/instructions/module-conventions.md)，实际公开符号见[API 清单](module-api-inventory.md)；不把普通源文件的 `export` 当作包的公开 API。

## 文件族

常规 TypeScript 源文件使用 `<模块>[-<领域>]-<角色>[-<实体或实现>].ts`。同一文件族保持角色位置一致，例如 `scheduler-repository-task.ts`、`scheduler-repository-log.ts`、`payment-provider-wechat.ts`。已有明确协议领域与框架固定名称按下表保留，避免只为增加前缀而产生路径迁移。

| 包           | 命名依据与保留的入口                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| ai           | `ai-*`、`ai-<领域>-*`；A2A Card 构建为 `ai-a2a-card.ts`，任务运行逻辑为 `ai-a2a-runtime.ts`                       |
| api-client   | `api-client-*`，`index.ts` 转发公共客户端契约                                                                     |
| api-contract | 根入口及协议领域目录；`payment-schemas.ts`、`storage-contract.ts` 等直接表达对应协议                              |
| audit        | `audit-*`；便捷记录器工厂只在模块内部复用                                                                         |
| cache        | `cache-*`，后端为 `cache-provider-*`                                                                              |
| capacitor    | `capacitor-*`，Node/Browser 条件入口保留对应构建契约                                                              |
| cli          | `cli-*`；命令启动入口与生成模板遵循 CLI、SvelteKit、Vite、Tauri 各自固定名称                                      |
| core         | `core-*`、`core-function-*`、`core-util-*`；Node/Browser 入口保持实际环境差异                                     |
| crypto       | `crypto-*`、`crypto-transport-*`；客户端子路径与服务端入口分开                                                    |
| datapipe     | `datapipe-*`；纯函数与显式抛错工具按签名处理                                                                      |
| deploy       | `deploy-*`、`deploy-<领域>-*`；容器与平台配置文件保留工具原生名称                                                 |
| iam          | `iam-*`、`iam-<领域>-*`；Provider 与 Repository 在实际实现目录中                                                  |
| kit          | `kit-*`；`browser.ts` 是已发布的条件入口，SvelteKit 路由文件保留框架名称                                          |
| payment      | Provider 统一为 `payment-provider-<渠道>.ts`，渠道协议工具为 `payment-<渠道>-<角色>.ts`                           |
| reach        | `reach-*`、`reach-provider-*`                                                                                     |
| reldb        | `reldb-*`、`reldb-provider-*`；内部 Provider 契约留在 providers 目录                                              |
| scheduler    | `scheduler-*`；Repository 统一为 `scheduler-repository-<实体>.ts`                                                 |
| serv         | `serv-*`、`serv-feature-*`、`serv-middleware-*`；App 工厂保持实际生命周期                                         |
| storage      | `storage-*`、`storage-provider-*`；browser-safe schemas 子路径独立构建                                            |
| ui           | Svelte 组件保留 `PascalCase.svelte`，局部工具按组件/场景命名，`.svelte.ts` 表示实际 rune 模块；不改组件公共导入名 |
| vecdb        | `vecdb-*`、`vecdb-provider-*`；直接复用各可选 SDK 的真实类型                                                      |

`index.ts` 等转发入口可按公共契约选择性导出。仅当整个源文件都是公共契约时使用 `export *`。测试可按行为或对应源文件命名；源文件镜像测试随文件族同步迁移，测试夹具与框架路由不强加模块前缀。

## 冗余与边界

- A2A 的持久任务与事件只由共享 journal 发布。旧 `ReldbA2ATaskStore` 与 SDK 默认 handler 的重复装配已删除，不再注册旧 tasks 表。Card、send/stream/get/cancel/resubscribe 和不支持 RPC 的标准错误仍由完整 handler 契约覆盖；取消、代际、期限、租约与消息幂等规则不变。SDK ResultManager 的事件合并对象只用于当前事件的局部计算，合并结果与事件一次 CAS 发布，不能成为独立的任务权威。
- 内部审计记录器工厂通过源文件 export 供模块复用；调用方使用 `audit.helper` 与其公开 `AuditHelper` 类型。真实 Provider 注册扩展，如 `PaymentProvider`、`AIStoreProvider`，继续保留。
- Qdrant/Chroma 使用 type import 与动态 import，删除仿造 SDK 接口、重复字段断言和没有当前驱动依据的旧错误/返回值兼容分支。Qdrant 只把真实 REST 错误的顶层 HTTP 404 视为集合不存在；外部 named-vector 或 Manhattan 集合不映射为未命名 cosine 集合。Chroma 宽 metadata/filter 边界仍交给真实 SDK 校验，省略的可选 content 按当前 SDK 的字符串字段处理。
- Qdrant URL 复用 `core.sanitize.sanitizeUrl`，同时覆盖用户信息、敏感 query 和 fragment。原 logger 链已经再次脱敏；这里删除的是冗余局部 helper，不把 helper 的覆盖差异宣称为已发生的日志泄漏。

## 验证方式

迁移后核对旧路径零引用、相对导入大小写、实际包构建与公开入口声明，再执行受影响行为用例。可选后端类型与协议行为必须用对应真实 SDK/服务验证；mock 只验证受控故障或日志上下文边界。模板完整门禁与根全量测试在所有修正任务完成后统一执行。
