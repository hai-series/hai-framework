# hai Framework

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

框架模块、`apps/` 示例和 CLI 模板均内置简体中文（`zh-CN`）、英文（`en-US`）和日语（`ja-JP`）。`core.i18n.setGlobalLocale('ja')` 会规范化为 `ja-JP`；应用通过语言菜单切换。

> 当前处于 `0.1.0-alpha` 阶段：公共契约仍在演进。生产采用前请锁定版本，并针对自身场景完成安全与容量验证。

生产多实例部署请先核对[22 包共享状态与恢复能力表](.agents/instructions/distributed-state.md)：数据库使用 PostgreSQL/MySQL，缓存使用 Redis，对象与向量使用共享服务；模块启动会拒绝本机后端。文档分别说明 CAS/租约、幂等、未知外部效果及已验证边界。

<p align="center">
  <strong>AI Runtime · 企业级全栈模块 · Agent Skills · 端到端类型安全</strong>
</p>

<p align="center">
  面向 AI 应用的 TypeScript 全栈框架 —— 从一次 LLM 调用，到可交付的企业级应用。
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6%20%2F%207-3178c6.svg">
  <img alt="Node" src="https://img.shields.io/badge/Node-%5E22.23.4%20%7C%20%5E24.22.1%20%7C%20%5E26.12.1-339933.svg">
  <img alt="Svelte" src="https://img.shields.io/badge/Svelte-5-ff3e00.svg">
</p>

---

## 简介

hai Framework 是一个以 **AI Runtime 为核心、企业能力按需组合、面向 AI 编程助手优化** 的 TypeScript 全栈开发框架。

最小场景仅需 `@h-ai/ai` 即可完成 LLM 与工具调用；当业务需要持久化、多租户、认证、审计、API、UI 或部署时，再按需组合 `reldb`、`vecdb`、`iam`、`audit`、`serv`、`ui` 等模块。框架不强制任何应用一次性引入完整技术栈。

框架以统一的 API 风格整合了四类能力，使 AI 助手能够端到端地构建功能完整的智能应用：

- **AI 能力** —— LLM 对话、文生图、语音（ASR / TTS）、MCP 协议、工具调用、RAG 与向量检索
- **安全能力** —— 国密加密、身份认证、RBAC 授权、审计日志
- **数据能力** —— 关系数据库、缓存、对象存储、数据管线
- **运营能力** —— 支付、用户触达、定时任务、自动化部署

## 从这里开始

| 你想做什么             | 建议入口                                       |
| ---------------------- | ---------------------------------------------- |
| 创建完整应用           | [创建、开发和交付指南](docs/usage/README.md)   |
| 在现有工程使用某个能力 | [模块清单](#功能清单)，再读对应包的使用入门    |
| 让 AI 按需求实现功能   | [AI 使用索引](LLMS.txt)和生成工程的 AGENTS.md  |
| 构建镜像或离线部署     | [构建与部署](packages/deploy/README.md)        |
| 参与框架开发           | [开发与测试](#二次开发)和[工作规范](AGENTS.md) |

## 核心特色

| 特色                  | 说明                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **AI-First 设计**     | 每一处 API 设计都优先保证 AI 编程助手能够正确使用；AI 用得对，人也用得顺。                |
| **统一生命周期**      | 有状态模块遵循 `init() → use → close()`，有状态模块共享使用习惯；工厂和纯函数按各自契约。 |
| **显式失败语义**      | 领域操作统一返回 `HaiResult<T>`，成功与失败在类型层面强制区分。                           |
| **配置即校验**        | Zod Schema 在 `init()` 阶段完成校验，配置错误在启动时暴露，而非运行时。                   |
| **按需组合**          | 22 个可独立发布的模块，最小依赖 `@h-ai/core`，按业务场景逐步引入。                        |
| **端到端类型安全**    | 严格模式 TypeScript，`api-contract → serv → api-client` 全链路类型推断。                  |
| **多端 UI**           | Svelte 5 Runes 组件（原子 / 组合 / 场景），覆盖桌面与移动端。                             |
| **脚手架与部署**      | `hai create` 创建完整项目，`hai deploy` 部署到 Vercel 或自建主机。                        |
| **Agent Skills 内置** | 每个模块随附标准化 Skill 文件，AI 助手可直接获取正确用法。                                |

## 设计理念

**"AI-First" 并非"仅供 AI 使用"，而是让框架的每一个设计决策都优先考虑 AI 编程助手能否正确使用。** 当 AI 能正确使用时，人类开发者的体验同样更好。

多数框架面向人类开发者设计，强调灵活与自由、以约定代替强制。但当由 AI 编写代码时，这种自由会带来不确定性：模式选择、错误处理、日志规范都可能因缺乏约束而不一致。hai Framework 通过统一的契约、可执行的规范与随附的 Skill，让 AI 在生成代码时保持风格一致、类型安全、错误处理完整，并输出人类可审查的结果。

这一理念具体落实为以下设计决策：

| 设计决策                          | 对 AI 的价值         | 对人的价值                     |
| --------------------------------- | -------------------- | ------------------------------ |
| 统一生命周期 `init → use → close` | 只需掌握一种使用模式 | 模块行为可预期                 |
| `HaiResult<T>` 领域返回值         | 主流程显式处理失败   | 减少业务 try-catch，调用链清晰 |
| Zod 配置校验                      | 配置错误即时反馈     | 启动即校验，运行时不失控       |
| Provider 模式                     | 切换后端仅需改配置   | 多环境无缝迁移                 |
| 严格 TypeScript                   | 类型推断引导正确调用 | 重构有保障                     |
| Skill 文件 + LLMS.txt             | 自动获取正确用法     | 生成代码质量更高               |
| 可执行编码规范                    | 每次改动自动遵循     | 代码风格一致，降低评审成本     |

> **关于失败语义**：领域操作优先返回 `HaiResult<T>` —— 成功为 `{ success: true, data }`，失败为 `{ success: false, error }`。`AsyncIterable`、客户端传输、回调与 SvelteKit 控制流等必须抛出异常的边界，在类型与文档中单独标注。

## 技术栈

| 层面       | 选型                                                           |
| ---------- | -------------------------------------------------------------- |
| 语言       | TypeScript 6 / 7（严格模式）                                   |
| 运行时     | Node.js 22.23.4+ / 24.22.1+ / 26.12.1+                         |
| 前端框架   | Svelte 5（Runes）+ SvelteKit 2                                 |
| UI         | Tailwind CSS 4 + DaisyUI 5 + Bits UI v2                        |
| API 契约   | oRPC + Zod + OpenAPI 3.1（`api-contract → serv → api-client`） |
| API 服务   | Hono + oRPC + Scalar 文档页                                    |
| 关系数据库 | SQLite / PostgreSQL / MySQL（原生 SQL，非 ORM）                |
| 向量数据库 | LanceDB / pgvector / Qdrant / Chroma                           |
| 缓存       | 内存 / Redis（单机 / Cluster / Sentinel）                      |
| 对象存储   | 本地文件系统 / S3 兼容（AWS / MinIO / 阿里云 OSS）             |
| AI         | OpenAI 兼容 API + MCP 协议                                     |
| 加密       | 国密 SM2 / SM3 / SM4                                           |
| 支付       | 微信支付 / 支付宝 / Stripe                                     |
| 桌面端     | Tauri                                                          |
| 移动端     | Capacitor（Android / iOS）                                     |
| 构建       | pnpm + Turborepo + Vite + tsup                                 |
| 部署       | Vercel（SaaS）· docker-ssh 自建主机 · Neon / Upstash / R2      |

## 快速入门

从环境准备、手工编码或 AI first 开发，到编译、镜像/原生打包、自动或离线部署、框架升级，见完整使用指南：[简体中文](docs/usage/README.md) · [English](docs/usage/README.en.md) · [日本語](docs/usage/README.ja.md)。其中包含命令参数、`hai.json` 配置和实际 skills 的使用流程。

准备符合项目 `engines` 的 Node.js（`^22.23.4 || ^24.22.1 || ^26.12.1`）与 pnpm 12.11.2；PowerShell 使用 `pnpm.cmd`。

上述最低版本来自 [2026-10-21 Node.js 官方安全发布](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)。仅支持 Node.js 22、24、26 各发布线中符合最低版本的版本；不支持较旧版本、已停止维护的发布线或未经验证的未来主版本。开发、CI 与容器推荐使用 Node.js 24.22.1 LTS。

### 创建新项目

```bash
# 全局安装 CLI
pnpm add -g @h-ai/cli

# 创建带部署能力的 Web + API；省略选项可交互选择
hai create my-app --type fullstack --frontends web --yes

# 默认已安装依赖，进入工程启动
cd my-app
pnpm dev
```

### 代码生成

以下 page/api 生成器面向 SvelteKit 文件路由。fullstack/API workspace 的 contract、procedure 和 hash 页面沿生成工程结构开发，见[使用指南](docs/usage/README.md)。

```bash
hai generate page dashboard         # 生成页面
hai generate component UserCard     # 生成组件
hai generate api users              # 生成 API 路由

# 快捷别名
hai g:page dashboard
hai g:component UserCard
```

### 构建并部署

```bash
# 构建不区分环境，auto 优先使用可达的 Podman，再尝试 Docker
pnpm build --target docker
# 配置 .env.prod 与部署目标后，发布已有 API/Web 镜像
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
# 两机不通时只生成包，按包内 README 手工搬运启动
pnpm run deploy --env prod --build --bundle-only
```

部署工具默认作为开发依赖安装，不需要时在创建命令中加 `--no-deploy`。每个镜像在 `images/` 下使用独立 Dockerfile，根 `hai.json` 的 `build` 指定构建文件，`deploy` 保存整个项目的部署参数。离线交付将 tar、配置、清单和 Windows/Linux/macOS 脚本全部放在本次单一目录；隔离服务器复制该目录后执行 `sh deploy-local.sh`，自动校验、解包和部署。局部发布以服务器成功版本为基线，保留其他服务和数据卷，不执行全项目 down。同版本允许重新构建，构建 ID 和校验和区分内容。依赖缓存、人工操作与失败恢复见[使用指南](docs/usage/README.md)。

### 在现有项目中集成

`@h-ai/core` 为必装基础，其余模块按需引入：

```bash
pnpm add @h-ai/core                 # 基础能力（必装）
pnpm add @h-ai/ai                   # AI / LLM / MCP / 文生图 / 语音
pnpm add @h-ai/reldb                # 关系数据库
pnpm add @h-ai/vecdb                # 向量数据库
pnpm add @h-ai/iam                  # 身份认证 / 授权
pnpm add @h-ai/ui                   # UI 组件库
# …按需添加其余模块
```

> 也可在已有项目根目录运行 `hai add <module>` 增量启用模块，CLI 会自动解析依赖并补全配置。

## 功能清单

框架当前提供 **22 个可独立发布的模块**，按职责分为五层。

### 基础能力

| 包名           | 职责                                                                                              | Provider 支持 |                                             npm 最新版                                              |
| -------------- | ------------------------------------------------------------------------------------------------- | :-----------: | :-------------------------------------------------------------------------------------------------: |
| `@h-ai/core`   | 框架基石：`HaiResult` 类型、日志（child 上下文）、配置加载、ID 生成、i18n、错误定义体系、工具函数 |       —       |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcore)](https://www.npmjs.com/package/@h-ai/core)   |
| `@h-ai/crypto` | 国密算法：SM2 非对称加密/签名、SM3 哈希、SM4 对称加密、密码哈希                                   |       —       | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcrypto)](https://www.npmjs.com/package/@h-ai/crypto) |

### 数据层

| 包名             | 职责                                                                 |              Provider 支持              |                                               npm 最新版                                                |
| ---------------- | -------------------------------------------------------------------- | :-------------------------------------: | :-----------------------------------------------------------------------------------------------------: |
| `@h-ai/reldb`    | 关系数据库：DDL、原生 SQL、事务、分页、CRUD 仓库                     |         ✅ SQLite / PG / MySQL          |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Freldb)](https://www.npmjs.com/package/@h-ai/reldb)    |
| `@h-ai/vecdb`    | 向量数据库：集合管理、向量插入、相似度搜索                           | ✅ LanceDB / pgvector / Qdrant / Chroma |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fvecdb)](https://www.npmjs.com/package/@h-ai/vecdb)    |
| `@h-ai/cache`    | 缓存与分布式锁：KV、Hash、List、Set、SortedSet、Lock，Redis 风格 API |            ✅ Memory / Redis            |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcache)](https://www.npmjs.com/package/@h-ai/cache)    |
| `@h-ai/storage`  | 文件存储：上传/下载/删除/复制/预签名 URL                             |              ✅ Local / S3              |  [![npm](https://img.shields.io/npm/v/%40h-ai%2Fstorage)](https://www.npmjs.com/package/@h-ai/storage)  |
| `@h-ai/datapipe` | 数据管线：文本清洗、7 种分块模式、可组合管线（纯函数，无需 init）    |                    —                    | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fdatapipe)](https://www.npmjs.com/package/@h-ai/datapipe) |

### 业务能力

| 包名              | 职责                                                                                                                         |       Provider 支持        |                                                npm 最新版                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | :------------------------: | :-------------------------------------------------------------------------------------------------------: |
| `@h-ai/iam`       | 身份与访问管理：认证（密码/OTP/LDAP）、RBAC 授权、会话管理、用户管理                                                         |             —              |       [![npm](https://img.shields.io/npm/v/%40h-ai%2Fiam)](https://www.npmjs.com/package/@h-ai/iam)       |
| `@h-ai/reach`     | 用户触达：邮件、短信、API 回调，模板引擎、免打扰（DND）                                                                      | ✅ SMTP / 阿里云短信 / API |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Freach)](https://www.npmjs.com/package/@h-ai/reach)     |
| `@h-ai/feedback`  | 用户反馈：现场采集、私有截图、邮件通知、分页处理与离线诊断包                                                                 |       DB / S3 / SMTP       |                                                     —                                                     |
| `@h-ai/ai`        | AI 集成：LLM 对话（同步/流式）、文生图、语音（ASR/TTS）、工具调用、MCP、Embedding、RAG/知识库、记忆、上下文管理、Rerank、A2A |  ✅ OpenAI 兼容 / 可扩展   |        [![npm](https://img.shields.io/npm/v/%40h-ai%2Fai)](https://www.npmjs.com/package/@h-ai/ai)        |
| `@h-ai/payment`   | 统一支付：订单创建、多端调起、回调通知                                                                                       | ✅ 微信 / 支付宝 / Stripe  |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fpayment)](https://www.npmjs.com/package/@h-ai/payment)   |
| `@h-ai/audit`     | 审计日志：操作记录、分页查询、统计聚合、定时清理                                                                             |             —              |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Faudit)](https://www.npmjs.com/package/@h-ai/audit)     |
| `@h-ai/scheduler` | 定时任务：Cron 调度、JS 函数 / HTTP API 执行、DB 持久化、分布式锁、执行日志                                                  |             —              | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fscheduler)](https://www.npmjs.com/package/@h-ai/scheduler) |

### 集成层

| 包名                 | 职责                                                                                                    | Provider 支持 |                                                   npm 最新版                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------- | :-----------: | :-------------------------------------------------------------------------------------------------------------: |
| `@h-ai/api-contract` | 公共 HTTP API 契约：oRPC contract + Zod，按应用组合领域 contract，输出统一 `HaiResult<T>`               |       —       | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fapi-contract)](https://www.npmjs.com/package/@h-ai/api-contract) |
| `@h-ai/serv`         | API Service 运行时：Hono + oRPC，挂载 contract / procedures，生成 OpenAPI 3.1 与 Scalar 文档            |       —       |         [![npm](https://img.shields.io/npm/v/%40h-ai%2Fserv)](https://www.npmjs.com/package/@h-ai/serv)         |
| `@h-ai/kit`          | SvelteKit 集成：Handle Hook、中间件、路由守卫、表单校验、同源 endpoint 工具（不承载公共 HTTP contract） |       —       |          [![npm](https://img.shields.io/npm/v/%40h-ai%2Fkit)](https://www.npmjs.com/package/@h-ai/kit)          |
| `@h-ai/api-client`   | 跨端 typed client：基于 `api-contract` 调用嵌套方法，Bearer / httpOnly cookie Token 管理、401 刷新      |       —       |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fapi-client)](https://www.npmjs.com/package/@h-ai/api-client)   |
| `@h-ai/capacitor`    | 移动端桥接：安全 Token 存储、设备信息、推送通知、相机、状态栏                                           |       —       |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcapacitor)](https://www.npmjs.com/package/@h-ai/capacitor)    |

### 界面与工具

| 包名           | 职责                                                                                                       |                           Provider 支持                            |                                             npm 最新版                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------: |
| `@h-ai/ui`     | UI 组件库：Svelte 5 Runes 组件（20 原子 + 36 组合 + 36 场景），15 精选主题                                 |                                 —                                  |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Fui)](https://www.npmjs.com/package/@h-ai/ui)     |
| `@h-ai/cli`    | CLI 脚手架：项目创建、模块添加、代码生成、一键部署                                                         |                                 —                                  |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcli)](https://www.npmjs.com/package/@h-ai/cli)    |
| `@h-ai/deploy` | 自动化部署：Vercel（SaaS，自动开通云资源）与 docker-ssh（容器化经 SSH 部署到自有主机，按功能生成 sidecar） | ✅ Vercel / docker-ssh · Neon / Upstash / R2 / Resend / 阿里云短信 | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fdeploy)](https://www.npmjs.com/package/@h-ai/deploy) |

### 模块文档索引

| 分类       | 模块                 | README                                                                 |
| ---------- | -------------------- | ---------------------------------------------------------------------- |
| 基础能力   | `@h-ai/core`         | [`packages/core/README.md`](./packages/core/README.md)                 |
| 基础能力   | `@h-ai/crypto`       | [`packages/crypto/README.md`](./packages/crypto/README.md)             |
| 数据层     | `@h-ai/reldb`        | [`packages/reldb/README.md`](./packages/reldb/README.md)               |
| 数据层     | `@h-ai/vecdb`        | [`packages/vecdb/README.md`](./packages/vecdb/README.md)               |
| 数据层     | `@h-ai/cache`        | [`packages/cache/README.md`](./packages/cache/README.md)               |
| 数据层     | `@h-ai/storage`      | [`packages/storage/README.md`](./packages/storage/README.md)           |
| 数据层     | `@h-ai/datapipe`     | [`packages/datapipe/README.md`](./packages/datapipe/README.md)         |
| 业务能力   | `@h-ai/iam`          | [`packages/iam/README.md`](./packages/iam/README.md)                   |
| 业务能力   | `@h-ai/reach`        | [`packages/reach/README.md`](./packages/reach/README.md)               |
| 业务能力   | `@h-ai/feedback`     | [`packages/feedback/README.md`](./packages/feedback/README.md)         |
| 业务能力   | `@h-ai/ai`           | [`packages/ai/README.md`](./packages/ai/README.md)                     |
| 业务能力   | `@h-ai/payment`      | [`packages/payment/README.md`](./packages/payment/README.md)           |
| 业务能力   | `@h-ai/audit`        | [`packages/audit/README.md`](./packages/audit/README.md)               |
| 业务能力   | `@h-ai/scheduler`    | [`packages/scheduler/README.md`](./packages/scheduler/README.md)       |
| 集成层     | `@h-ai/api-contract` | [`packages/api-contract/README.md`](./packages/api-contract/README.md) |
| 集成层     | `@h-ai/serv`         | [`packages/serv/README.md`](./packages/serv/README.md)                 |
| 集成层     | `@h-ai/kit`          | [`packages/kit/README.md`](./packages/kit/README.md)                   |
| 集成层     | `@h-ai/api-client`   | [`packages/api-client/README.md`](./packages/api-client/README.md)     |
| 集成层     | `@h-ai/capacitor`    | [`packages/capacitor/README.md`](./packages/capacitor/README.md)       |
| 界面与工具 | `@h-ai/ui`           | [`packages/ui/README.md`](./packages/ui/README.md)                     |
| 界面与工具 | `@h-ai/cli`          | [`packages/cli/README.md`](./packages/cli/README.md)                   |
| 界面与工具 | `@h-ai/deploy`       | [`packages/deploy/README.md`](./packages/deploy/README.md)             |

### 常见初始化顺序

多数项目可按下列顺序初始化模块，既符合依赖关系，也便于 AI 助手推断：

`core → reldb / cache / storage / vecdb → iam / audit / scheduler / reach → ai / payment → api-contract → serv → kit / api-client / ui / capacitor`

- `iam` 依赖已初始化的 `reldb` 与 `cache`
- `audit` 依赖已初始化的 `reldb`
- `scheduler` 启用 DB 持久化时建议先初始化 `reldb`；若 `cache` 已初始化，会自动启用分布式锁能力
- `reach`、`payment`、`ai` 会按功能场景复用下游模块能力，详细配置以各模块 README 为准
- `api-contract` 无需初始化，只描述公共 HTTP API 的 schema 与 oRPC contract
- `serv` 在业务模块初始化后创建 Hono app，`contract` 与 `procedures` 形状必须对应
- `kit` 保留 SvelteKit Hook / guard / 同源 endpoint 能力；跨端公共 API 不在 `kit` 中定义
- `api-client` 在 Web / App / SSR 侧消费同一个应用级 contract，默认返回 `HaiResult<T>`

## 架构

```mermaid
graph TD
    APP["应用层 · apps/<br/>admin-console · api-service · corporate-website · h5-app<br/>desktop-app · mobile-app · ai-playground"]

    subgraph INTEG["集成层"]
        KIT["kit（SvelteKit 管道 / 守卫）"]
        SERV["serv（Hono + oRPC · OpenAPI）"]
        CLIENT["api-client（typed client · Token）"]
    end

    CONTRACT["api-contract（Schema + oRPC Contract 源）"]

    subgraph BIZ["业务能力"]
        B["iam · ai · payment · reach · audit · scheduler"]
    end

    subgraph DATA["数据层"]
        D["reldb · vecdb · cache · storage · datapipe"]
    end

    CORE["core（HaiResult · Logger · Config · i18n · Utils）"]
    TOOL["工具链：cli · deploy · capacitor · ui · crypto"]

    APP --> INTEG
    SERV --> CONTRACT
    CLIENT --> CONTRACT
    INTEG --> BIZ
    BIZ --> DATA
    BIZ --> CORE
    DATA --> CORE
    TOOL -.-> APP
```

**依赖方向**：上层依赖下层，`@h-ai/core` 是最底层基础，不反向依赖任何模块。公共 HTTP API 统一遵循 **`api-contract`（定义）→ `serv`（实现 / 挂载）→ `api-client`（调用）**；`kit` 只负责 SvelteKit 管道与同源 endpoint，不承载跨端公共 contract。

## 使用示例

以下为各能力组的代表性片段。业务变量与 schema 需结合具体应用补齐；完整 API、错误码与更多范例见各模块 README 与根目录 [`LLMS.txt`](./LLMS.txt)。

### HaiResult 错误处理

领域操作以 `HaiResult` 表达失败语义；流式迭代、网络客户端、框架控制流与第三方回调可能抛出异常，应按对应 API 文档在边界捕获：

```typescript
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, 'Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  const quotient = result.data // 5
}
else {
  core.logger.warn('Division failed', { code: result.error.code, message: result.error.message })
}
```

### 关系数据库

```typescript
import { reldb } from '@h-ai/reldb'

const initResult = await reldb.init({ type: 'sqlite', database: './data/app.db' })
if (!initResult.success)
  throw new Error(initResult.error.message)

// DDL — 建表
await reldb.ddl.createTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  email: { type: 'TEXT', notNull: true, unique: true },
  name: { type: 'TEXT' },
}, true)

// 参数化查询与分页
const users = await reldb.sql.query<User>('SELECT * FROM users WHERE name = ?', ['Alice'])
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM users',
  pagination: { page: 1, pageSize: 20 },
})

// 事务
await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['1', 'a@b.com'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
})

// CRUD 仓库（自动生成 SQL）
const userRepo = reldb.crud.table<User>({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'email', 'name'],
  createColumns: ['id', 'email', 'name'],
  updateColumns: ['email', 'name'],
  dbType: 'sqlite',
})
await userRepo.create({ id: '1', email: 'a@b.com', name: 'Alice' })
```

### 向量数据库

```typescript
import { vecdb } from '@h-ai/vecdb'

const initResult = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initResult.success)
  throw new Error(initResult.error.message)

await vecdb.collection.create('docs', { dimension: 1536 })
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: embeddings, content: '文档内容', metadata: { source: 'wiki' } },
])
const results = await vecdb.vector.search('docs', queryVector, { topK: 5, minScore: 0.7 })
```

### 缓存

```typescript
import { cache } from '@h-ai/cache'

const initResult = await cache.init({ type: 'memory' })
if (!initResult.success)
  throw new Error(initResult.error.message)
// await cache.init({ type: 'redis', url: 'redis://localhost:6379' })

await cache.kv.set('key', { name: 'Alice' }, { ex: 3600 })
const val = await cache.kv.get<{ name: string }>('key')
await cache.zset.zadd('leaderboard', { score: 100, member: 'Alice' })
```

### AI / LLM / 文生图 / 语音

```typescript
import { ai } from '@h-ai/ai'

// 初始化（OpenAI 兼容 API）；未初始化 reldb/vecdb 时使用进程内临时 Store
const initResult = await ai.init({
  llm: { apiKey: process.env.HAI_AI_LLM_APIKEY, model: 'gpt-4o-mini' },
})
if (!initResult.success)
  throw new Error(initResult.error.message)

// 同步调用
const chat = await ai.llm.chat({
  messages: [{ role: 'user', content: '用一句话解释量子计算' }],
})
if (chat.success)
  void chat.data.choices[0].message.content

// 流式调用
const stream = ai.llm.chatStream({ messages: [{ role: 'user', content: '讲一个故事' }] })
for await (const chunk of stream)
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')

// 文生图
const image = await ai.image.generate({ prompt: '一只在星空下的猫', size: '1024x1024' })

// 语音合成（TTS）
const speech = await ai.audio.synthesize({ text: '你好，世界', voice: 'default' })
```

### 身份认证 & 授权

```typescript
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 先初始化 reldb 与 cache，IAM 会复用已初始化单例
const dbInit = await reldb.init({ type: 'sqlite', database: './data/app.db' })
if (!dbInit.success)
  throw new Error(dbInit.error.message)
const cacheInit = await cache.init({ type: 'memory' })
if (!cacheInit.success)
  throw new Error(cacheInit.error.message)
const iamInit = await iam.init({ session: { maxAge: 86400, sliding: true } })
if (!iamInit.success)
  throw new Error(iamInit.error.message)

await iam.user.register({ username: 'alice', password: 'StrongPass123!' })
const loginResult = await iam.auth.login({ identifier: 'alice', password: 'StrongPass123!' })

// RBAC 权限控制
await iam.authz.assignRole(userId, 'admin')
const allowed = await iam.authz.checkPermission(userId, 'users:read')
```

### 公共 API：契约 → 服务 → 客户端

```typescript
// 1) 契约（api-contract）：只描述“有哪些 API”，纯定义、无业务实现
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
})
```

```typescript
// 2) 服务（serv）：挂载 contract + procedures，生成 OpenAPI 与文档页
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'

const app = serv.createApp({
  contract,
  procedures: {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({ storage }),
    ai: createAiProcedures({ ai }),
  },
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
  },
  iam, // 顶层传入后自动派生 access token 校验
})
serv.listen(app, { host: '0.0.0.0', onClose: closeApp })
```

```typescript
// 3) 客户端（api-client）：Web / App / SSR 消费同一份契约，默认返回 HaiResult<T>
import { apiClient } from '@h-ai/api-client'

const initResult = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
if (!initResult.success)
  throw new Error(initResult.error.message)

const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'xxx' })
if (login.success)
  await apiClient.auth.setTokens(login.data.tokens)
```

### Svelte 5 UI 组件

```text
<script lang="ts">
  import { Button, Card, DataTable, Input, Modal } from '@h-ai/ui'

  let showModal = $state(false)
  let users = $state([])
</script>

<Card>
  <DataTable
    data={users}
    columns={[
      { key: 'name', label: '姓名' },
      { key: 'email', label: '邮箱' },
    ]}
    keyField="id"
  >
    {#snippet actions(user)}
      <Button size="xs" onclick={() => edit(user)}>编辑</Button>
    {/snippet}
  </DataTable>
</Card>

<Button onclick={() => (showModal = true)}>新建用户</Button>

<Modal bind:open={showModal} title="新建用户">
  <Input label="姓名" bind:value={name} />
  <Input label="邮箱" bind:value={email} type="email" />
</Modal>
```

> 其余模块（`storage` / `datapipe` / `payment` / `audit` / `scheduler` / `reach` / `crypto` / `kit` / `capacitor` / `deploy`）的用法见各自 README 与 `LLMS.txt`。

## 新手引导与帮助中心

`@h-ai/ui/guide` 提供 `createGuide`、`GuideHost` 和 `HelpCenter`：首次 Cookie 提示、手动重看、进入指定页面后逐步高亮，以及可搜索的 Markdown 帮助中心。样式跟随现有主题，通用文案内置中英日文，业务内容复用应用 i18n。

`apps/admin-console` 与 CLI fullstack 的 Web/App/Desktop 默认启用。引导偏好按用户和版本隔离，支持稍后与不再提醒。接入示例和完整边界见 [UI 新手引导](packages/ui/README.md#新手引导与帮助中心)。

## 示例应用

仓库 `apps/` 目录提供 7 个可直接运行的示例应用，既是脚手架参考，也是模块联调样板；`api-service-contract` 为其中 API 相关应用共享的契约包。

| 应用                | 说明                                        | 使用的模块                                               |
| ------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `admin-console`     | 管理后台（全模块集成参考）                  | core, reldb, iam, cache, storage, crypto, ai, kit, ui    |
| `ai-playground`     | AI 能力实验台（LLM / 文生图 / 记忆 / 语音） | core, ai, kit, ui                                        |
| `api-service`       | Hono + oRPC API Service（contract 组合根）  | core, reldb, cache, iam, storage, ai, api-contract, serv |
| `corporate-website` | 企业官网 + 合作登记 + AI 客服               | core, reldb, cache, storage, ai, reach, kit, ui          |
| `h5-app`            | 移动端 H5（拍照识别 / 购物车 / 登录）       | core, reldb, iam, cache, storage, ai, kit, ui            |
| `desktop-app`       | Tauri 桌面应用                              | api-client, api-service-contract, crypto, ui             |
| `mobile-app`        | Capacitor Android / iOS 移动端应用          | api-client, api-service-contract, crypto, ui, capacitor  |

### 按应用启动

| 应用                | 启动方式                                |
| ------------------- | --------------------------------------- |
| `admin-console`     | `pnpm --filter admin-console dev`       |
| `ai-playground`     | `pnpm --filter ai-playground dev`       |
| `api-service`       | `pnpm --filter api-service dev`         |
| `corporate-website` | `pnpm --filter corporate-website dev`   |
| `h5-app`            | `pnpm --filter h5-app dev`              |
| `desktop-app`       | `cd apps/desktop-app && pnpm tauri:dev` |
| `mobile-app`        | `pnpm --filter mobile-app dev`          |

## 二次开发

### 本地开发

```bash
pnpm install                    # 安装依赖
pnpm dev                        # 全量开发模式
pnpm typecheck                  # 类型检查
pnpm lint                       # ESLint（含 check:skills）
pnpm test                       # 单元测试
pnpm --filter @h-ai/reldb test  # 只运行某个模块
```

### 项目结构

```
hai-framework/
├── packages/            # 22 个框架包（@h-ai/*）
│   └── cli/templates/   # CLI 脚手架模板（含 skills 模板，分发到生成应用）
├── apps/                # 示例应用
├── scripts/             # 校验与发布脚本
├── AGENTS.md            # AI 助手工作入口
├── LLMS.txt             # AI 使用索引
├── .agents/             # 通用开发规范（instructions/）与仓库 skills（skills/）
├── AGENTS.md            # 通用 AI 入口与任务导航
└── .github/             # GitHub Actions 与 Copilot 轻量入口
```

### AI-First 基础设施

本仓库以 [AGENTS.md](AGENTS.md) 为通用入口，详细规范在 `.agents/instructions/`，仓库开发 skills 在 `.agents/skills/`。Copilot 的路径指令只保留匹配条件和链接，Claude/OpenCode 的入口复用共享规则。Codex 原生读取 `AGENTS.md` 并发现 `.agents/skills/`，可在项目中用 `$hai-module-create`、`$hai-module-review` 等名称调用；参考文件按任务读取。依据：[Codex skills](https://learn.chatgpt.com/docs/build-skills)、[项目指引](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。

使用 `hai create` 创建项目时，CLI 生成同样的共享入口与 skills，并按应用类型提供 `AGENTS.md`：

```
my-app/
├── .agents/
│   └── skills/                       # 共享技能正文与参考（Codex 原生发现）
├── .github/
│   └── copilot-instructions.md       # 只引用共享 AGENTS.md
├── AGENTS.md                         # Codex / OpenCode / 通用 AI 指引
├── CLAUDE.md                         # Claude Code 项目指引（通过 @AGENTS.md 复用共享规范）
└── opencode.json                     # instructions 直接引用 AGENTS.md
```

| AI 助手        | 生成的关键文件                                                                            |
| -------------- | ----------------------------------------------------------------------------------------- |
| GitHub Copilot | `.github/copilot-instructions.md` → `AGENTS.md` + `.agents/skills/`                       |
| Cursor         | `AGENTS.md` + `.agents/skills/`                                                           |
| Claude Code    | `CLAUDE.md` + `AGENTS.md`（通过 `@AGENTS.md` 复用共享规范；不原生发现 `.agents/skills/`） |
| Codex          | `AGENTS.md` + `.agents/skills/`                                                           |
| OpenCode       | `AGENTS.md` + `.agents/skills/` + `opencode.json`                                         |

Skill 模板统一管理在 `packages/cli/templates/skills/`，由 `@h-ai/cli` 分发到用户项目的 `.agents/skills/`。除模块用法外，工作流包括文档审查与实施（`hai-spec-review`、`hai-spec-implement`）、功能开发与验证（`hai-app-create`、`hai-app-review`、`hai-app-tests`）、交付与维护（`hai-build`、`hai-deploy`、`hai-ci`、`hai-pr-review`、`hai-framework-sync`），具体串联方式见[完整使用指南](docs/usage/README.md)。仓库开发 skills 与应用模板分别维护，同步公共契约时保留各自的任务边界。改动后按范围执行 `typecheck → lint → build → test`，UI/路由与 CLI 模板再执行对应 E2E 门禁。

### 配置与环境变量

应用与模板使用统一的 `HAI_<配置名>_<路径>` 环境变量；根 [`.env.example`](.env.example) 列出所有可用变量、用途、枚举和范围。各 apps 示例的 `.env.example` 列出该应用的完整变量。

环境文件按用途维护：`.env.example` 完整记录字段与约束；`.env` 是公共基础，`.env.dev` / `.env.test` / `.env.prod` 是公共环境覆盖，均提交 Git；`.env.local` 是被忽略的本机私有覆盖。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。各应用自己的 `.env.example` 包含该应用的完整参数。

- **配置命名**：`HAI_<配置名>_<YAML 路径>`，层级以 `_` 分隔，camelCase 不拆词（如 `llm.apiKey` → `HAI_AI_LLM_APIKEY`）
- **配置优先级**：约定环境变量 > YAML 中的显式 `${VAR}` > YAML 默认值
- **AI 兼容回退**：`OPENAI_*` 仅用于 `@h-ai/ai` 的兼容 fallback
- **密钥安全**：密钥不写死、不进入日志，也不放入 `PUBLIC_*` / `VITE_*` 客户端变量

| 分组           | 代表变量                                 | 说明                                                       |
| -------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Runtime        | `HAI_CORE_ENV`、`HAI_CORE_LOGGING_LEVEL` | 运行环境与实际日志级别                                     |
| Database       | `HAI_DB_*`                               | `_db.yml` 的 SQLite / PostgreSQL / MySQL 配置              |
| Cache          | `HAI_CACHE_*`                            | `@h-ai/cache` 的 memory / Redis / Upstash 配置             |
| Session / Auth | `HAI_IAM_*`、`HAI_KIT_COOKIE_KEY`        | `@h-ai/iam`、`@h-ai/kit` 的认证与安全配置                  |
| API Service    | `PORT`、`HOST`、`PUBLIC_API_BASE`        | `apps/api-service` / `@h-ai/serv` 监听地址与前端访问地址   |
| Storage        | `HAI_STORAGE_*`                          | `@h-ai/storage` 的 local / S3 配置                         |
| AI             | `HAI_AI_LLM_*`                           | `@h-ai/ai` 的 LLM API Key、Base URL、模型配置              |
| VecDB          | `HAI_VECDB_*`                            | `@h-ai/vecdb` 的 LanceDB / pgvector / Qdrant / Chroma 配置 |
| Reach          | `HAI_REACH_*`                            | `@h-ai/reach` 的 SMTP、短信、Webhook 配置                  |
| Feedback       | `HAI_FEEDBACK_*`                         | 反馈应用、管理员收件人、采集容量与保留期限                 |
| Payment        | `HAI_PAYMENT_*`                          | `@h-ai/payment` 的微信、支付宝、Stripe 商户配置            |
| Deploy         | `HAI_DEPLOY_*`                           | `@h-ai/deploy` / `@h-ai/cli` 的部署与基础设施凭据          |

完整字段与默认值以根目录 `.env.example` 为准；在某个示例应用中工作时，再对照该应用自己的 `README.md` 与 `.env.example` 查看增量配置。

修改模块公开 Schema、YAML 或直接读取的环境变量后，先构建相关模块，再执行 `pnpm generate:env`，同步根 `.env.example`、CLI 配置元数据和各示例应用 `.env.example`；执行 `pnpm check:env` 检查是否过期。生成器只读取公开源码和示例，不读取 `.env.local`，不覆盖公共基础和环境文件中的项目取值。新增变量应说明用途、类型、枚举、单位、范围和启用条件；数组索引、动态键及父级对象覆盖仍须经过模块 Schema 和运行测试。

入口扫描排除 JS/TS（含 Svelte script）的真实 JSDoc；Schema 字段注释仍用于生成说明。模板/YAML 可选注释与字符串中的生成代码引用照常保留，示例注释不能新增运行变量。

`pnpm dev` / `dev:test` / `dev:prod` 选择开发、测试和生产配置，Node 服务构建后使用 `start:test` / `start:prod`。Vite 在 Node 配置阶段检查 `core.config.loadEnvFiles({ mode, envDir })` 结果后注入，Node 按基础、环境、本机的顺序传入 `--env-file`；`core.init` 不读取 dotenv。`development` / `production` 文件模式映射为 `dev` / `prod`。Provider 切换和旧变量迁移步骤见应用 skill 的[环境配置](packages/cli/templates/skills/hai-app-create/development.md#环境配置)。

配置字段、实际消费点、环境命名及生成应用之间的对应关系见[22 包配置对应表](.agents/skills/hai-module-create/configuration.md)。

### 质量门禁

按影响范围选择命令；跨包契约或根配置变更提升到根命令执行：

| 门禁     | 命令                      | 适用范围                      |
| -------- | ------------------------- | ----------------------------- |
| 类型检查 | `pnpm typecheck`          | 全部改动                      |
| 代码规范 | `pnpm lint`               | 全部改动（含 `check:skills`） |
| 构建     | `pnpm build`              | 构建 / 模板 / 发布 / 跨包契约 |
| 单元测试 | `pnpm test`               | 全部改动                      |
| 端到端   | `pnpm e2e`                | UI / 路由 / 端到端流程        |
| 发布验收 | `pnpm test:release-local` | 发布前全量验收（安装→E2E）    |

> Windows PowerShell 下使用 `pnpm.cmd`。根 `pnpm test` 先将无 Testcontainers 依赖的包并行执行（最多 4 包，再受可用 CPU 和内存限制），再串行调度容器包；每包最多两个文件 worker，两组不同时重写共享构建产物。仓库级 `pnpm e2e` 覆盖 CLI 脚手架门禁、部署运行时与锁，以及 Admin Console、AI Playground、Corporate Website、H5、Mobile Web 的 Playwright 套件；容器单测需要可用的 Docker / Podman。

CLI 的 Vitest 全局 teardown 会在 `test`、`test:e2e`、`test:deploy-gates` 成功、失败或正常取消后回收本轮构建的镜像。Podman 构建同时给中间层标记本轮身份；Docker 按本轮最终镜像 tag 回收。未构建镜像的测试不需要容器引擎。回收按实际构建引擎执行，只处理本轮身份与构建账本，保留公共基础镜像、外部 tag 和其他任务资源，不执行全局 prune 或强制删除。报告写入 `packages/cli/test-results/image-cleanup-*.json`；清理失败会使门禁失败。强杀进程、断电或引擎失联仍可能留下资源，Docker BuildKit 的独立构建缓存不在镜像回收范围内。

历史 Podman 无 tag 构建层可先预览，再显式删除（默认只选择超过 24 小时、历史名称为随机哈希加 `-tmp` 的镜像；仍被镜像或容器引用的层会保留）：

```bash
node scripts/cleanup-test-images.mjs --runtime=podman --legacy
node scripts/cleanup-test-images.mjs --runtime=podman --legacy --apply
```

`--min-age-hours=24` 调整历史镜像的最小年龄，`--report=tmp/container-cleanup/report.json` 指定逐项报告。该脚本也支持 `--runtime=docker`；没有可靠来源元数据的 Docker 历史层会保留，自动 teardown 使用本轮标签与账本处理两种引擎。真实引擎回归可用 `HAI_TEST_IMAGE_SMOKE=1`、`HAI_TEST_IMAGE_RUNTIME=podman`（或 `docker`）运行 `pnpm test:scripts`，验证成功、断言失败、构建失败、SIGINT/SIGTERM 取消后的回收与外部镜像保护。

### 提交校验（Leak Hooks）

仓库通过 Git hooks 在 `git commit` / `git push` 前检查泄漏关键词。本地可创建 `.leak-words.json`（已在 `.gitignore` 中，仅本地生效）：

```json
["your-leak-word"]
```

实际入口为 `.husky/pre-commit`、`.husky/commit-msg`、`.husky/pre-push` 与 `scripts/check-leak-words.mjs`。

## 许可证

[Apache-2.0](./LICENSE)
