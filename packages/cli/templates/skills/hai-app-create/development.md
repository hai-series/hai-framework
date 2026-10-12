# hai 应用开发决策

日常新增、修改和修复功能时读取本文件；专项模块 API 只读取下表匹配的 skill。这里的“应用尽用”是让每项真实需求优先使用适用框架能力，并检查已有 feature、配置和扩展点；不要求所有项目安装或启用全部模块。

## 先确认应用与版本

- 读取当前 `AGENTS.md`、README、`package.json`、lockfile、初始化入口和已有相似功能；用 `rg` 查实现、引用、测试。保留已有改动，沿用项目分层、命名、ESLint、i18n 与测试入口。
- 确认架构：SvelteKit 使用 `kit` 和文件路由；API workspace 使用 contract/service；fullstack 使用 contract/serv/shared 与所选前端；Vite SPA/原生端通过 typed API 客户端调用服务。不要把服务端目录、DB、密钥或 Node 初始化复制到浏览器。
- 从所属 workspace 的依赖与 lockfile 确认 `@h-ai/*` 实际解析版本和 npm/local 模式。模板 skill 提供导航，**当前安装包的 `package.json.exports`、公开 `.d.ts` 与随包文档决定可用 API**；本地框架源码只在版本匹配或显式联调时作实现证据。
- 若 skill 与安装版本不符，以公开类型和实际行为核验。先使用已支持能力；任务确需新版本时列明版本变更、调用方与验证范围。不能直接复制未发布源码的 API，也不能为绕过差异添加虚构兼容层。

## CLI 安装与命令

CLI 的 npm 包名是 `@h-ai/cli`，安装后提供 `hai` 命令。使用脚手架前先全局安装并确认版本；PowerShell 中使用 `pnpm.cmd` 执行 pnpm 命令。

```bash
pnpm add -g @h-ai/cli
hai --version
hai --help

# 新建项目
hai create my-app
```

已有项目先进入项目根目录，再按需要执行 `hai add <module>`、`hai init` 或 `hai generate <type> <name>`。已安装 CLI 时，相同安装命令可更新到当前发布版本；需要指定版本时使用 `@h-ai/cli@<version>`。命令和模板以实际安装的 CLI 为准，不能把未发布的框架源码能力当作已安装包能力。

## 将需求映射到现有能力

应用元信息只有一份配置来源：名称、版本、环境、默认语言与日志设置来自 `_core.yml`，使用 `core.config` 与 `core.logger`；Node 启动时不通过固定 `logging` 覆盖 YAML。SvelteKit 服务端 layout 和 fullstack `app.info` 仅公开必要元信息，不能下发整个 core 或模块配置。独立 Vite mobile-app 在 Node 构建阶段经 core 加载 YAML/环境覆盖并注入公开字段，配置变化需重新构建。环境覆盖使用 `HAI_CORE_NAME`、`HAI_CORE_VERSION`、`HAI_CORE_ENV`、`HAI_CORE_LOGGING_LEVEL` 等既有规则；容器明确配置生产环境，不能用另一个状态来源代替 `core.env`。

开发前，对本次涉及的需求简述“需求 → 现有应用实现/框架能力 → 版本与契约依据 → 修改位置与验收”。简单任务可用几句话；跨模块任务用表格。查找顺序：已有应用实现 → 框架公开能力和配置 → 最小业务补充。

下表技能名用于能力导航；先确认 `.agents/skills/<name>/SKILL.md` 存在再读取。CLI 按应用类型/已选模块交付技能，缺目录不代表框架没有该能力：继续查已安装包的公开 exports/types；确需补充模块/技能时按当前 CLI 帮助和项目依赖策略处理，不能跳过需求匹配或猜测不存在的 API。

| 需求 | 优先检查的能力与 skill | 使用边界 |
| --- | --- | --- |
| 配置、日志、ID、结果/错误、i18n | `hai-core` | getter、logger、ID 是直接值；ID 不作为密钥 |
| 数据库查询、CRUD、事务、分页 | `hai-reldb` | 先检查现有 CRUD/Repository 与事务支持，不另建 DB 连接层 |
| 缓存、TTL、共享锁 | `hai-cache` | 区分 memory 与共享后端；单进程状态不能承担跨节点防重 |
| 注册、登录、会话、角色/权限 | `hai-iam` | 优先配置内置认证能力；业务资源/租户授权仍由应用检查 |
| SvelteKit Hook、守卫、校验、响应 | `hai-kit` | 只用于 SvelteKit；沿用已有认证/transport 管道 |
| 共享输入输出和 HTTP contract | `hai-api-contract` | 扩展已有 contract 与 schema，不维护第二份业务路径 |
| API 运行时、内置 feature、route guard | `hai-serv` | 先检查内置 procedures/features 与 route auth/permission；不另写平行服务器 |
| 浏览器/原生 API、刷新会话 | `hai-api-client` | 已支持接口复用 typed client、认证与 transport；额外 fetch/刷新封装需有缺口依据 |
| 页面、表单、表格、弹窗、移动 UI | `hai-ui` | 按实际导出选择场景/组合/原子组件；应用补业务交互 |
| 文件上传、下载、元数据、预签名 URL | `hai-storage` | 检查已有 storage feature；资源授权、大小/类型/路径限制不可省略 |
| 加密、签名、哈希 | `hai-crypto` | 复用公开 API 与密钥配置，不自创加密或硬编码密钥 |
| LLM、流式、Embedding、RAG、Agent/MCP | `hai-ai` | 先检查内置能力与 provider 配置，再补应用编排 |
| 文本清洗、分块、管线 | `hai-datapipe` | 纯函数无生命周期；分块不代表已经生成向量 |
| 向量集合与检索 | `hai-vecdb` | 后端、维度与过滤条件使用实际契约 |
| 邮件/短信/通知触达 | `hai-reach` | 复用已有 provider；投递状态不等于 HTTP 成功 |
| 支付、订单、订阅、回调 | `hai-payment` | 验签、金额/订单绑定、幂等与状态迁移仍需业务验收 |
| 操作审计 | `hai-audit` | 复用审计记录/查询；应用决定脱敏、保留期及失败策略 |
| cron、持久任务、重试、手工触发 | `hai-scheduler` | 复用任务模型；明确取消、幂等、共享锁及可信代码边界 |
| 原生设备与安全 token 存储 | `hai-capacitor` | 仅在适用平台启用；桌面/小程序依当前项目适配 |

已有能力满足需求时使用它；已导入模块但仍手写其已有认证、缓存、上传、分页或 UI 功能，需要修正。确有缺口时记录缺失的具体能力、当前版本和最小补充方案，按需求增加依赖或应用代码；不为凑模块覆盖率增加服务和抽象。

独立 fullstack 默认后台的 Web/App/Desktop 共用管理组件、状态与 typed client。`@h-ai/serv/features/iam` 默认 procedures 可按需选用并与 contract 对齐；仅为业务审计或资源策略覆写必要路由。主题的 DOM 更新和安全缓存使用 `@h-ai/ui/theme`（`applyTheme` / `getSavedTheme`），应用只保留响应式状态与已编译主题白名单。固定角色、管理员自我保护、头像资源范围及写失败补偿仍由应用按需求实现。

Fullstack 创建时在被 Git 与容器构建忽略的根 `.env` 写入独立随机 `HAI_ADMIN_DEFAULT_PASSWORD`，`.env.example` 保留空占位。`dev` / `start` 自动读取；已有用户不重设密码。启动边界保留模块错误的具体说明与错误码，失败后反序清理。不能把生成的本地凭据复制到前端配置、日志、源码或镜像。

## 落实契约与安全边界

按本次真实输入、资源和副作用选取下面检查，并把适用项变成可观察验收。不能用“已遵循安全规范”或 lint 通过替代行为证据。

| 边界 | 实现要求 | 验收证据 |
| --- | --- | --- |
| 输入与输出 | 外部输入在请求/contract 边界 schema 校验，限制长度、分页、大小与合法枚举；从公开类型推导共享结构 | 非法/超限输入被拒绝，未触发写入或外部副作用；输出符合 contract |
| 身份与资源 | 使用对应架构守卫；另查资源所有者、租户、角色/权限；不能信任客户端传来的 userId/tenantId | 未登录、缺权限、跨用户/租户访问失败；正常路径可用 |
| SQL、文件、URL、内容 | SQL 值参数化，动态标识符白名单；文件防路径逃逸；用户控制的服务端请求 URL 限制目的地；HTML/AI 内容按不可信输入处理 | 相关注入/逃逸/越界目的地被拒绝；正常输入仍可用 |
| 凭据与会话 | 密钥仅服务端配置/环境，`.env.example` 只放占位；PUBLIC/VITE 配置不含密钥。沿用 Cookie/内存 token，原生用安全 TokenStorage；检查 CORS、Cookie、CSRF 与现有管道 | 浏览器产物/日志无敏感内容；登录/退出/刷新及适用的跨域攻击失败路径可验证 |
| HaiResult 与错误 | HaiResult 型业务 API 先判断 `success`，服务层保留错误；HTTP 边界沿实际包络/状态契约并隐藏内部敏感细节。显式抛错、流迭代与 SvelteKit 控制流按各自契约 | 依赖失败不回退为空列表/成功消息；流失败与业务状态失败有反馈，用户输入得到保留 |
| 初始化与清理 | 只对有生命周期的模块按依赖 init → use → close；检查每次结果，关键依赖失败停止启动，清理已创建资源，关闭反序 | 初始化失败不能继续执行业务；关闭/取消后连接、监听器与任务退出 |
| 写入与重试 | 多步一致性用事务或明确补偿；重试/回调/任务定义幂等；跨节点业务状态使用共享存储 | 中途失败无不一致写入；重复请求/回调不产生重复副作用 |
| 风格与可维护性 | 禁止 `any`、无说明的 `as unknown as T`、`console.log`、硬编码密钥；注释中文、日志英文且脱敏；文案使用现有 i18n 并同步中英文；遵循项目实际 lint 配置 | typecheck/lint 通过；人工核对脱敏、文本、分层与不受 lint 覆盖的规则 |

不把所有函数改成 HaiResult：纯工具、getter、工厂、客户端/流及控制流按实际签名。不把所有模块加上 init/close。应用服务根据已有业务契约返回 HaiResult，HTTP/UI 层做适当转换。

serv/oRPC 普通 procedure 返回的失败 HaiResult 可以位于 HTTP 200 包络，`error.httpStatus` 是错误元数据，不等于响应状态；输入 schema 校验、传输错误、路由中间件及 kit 的 Response 各有状态契约。验收同时检查响应体 `success/error.code` 和真实 HTTP 状态，不照搬另一架构的 401/500 断言，也不以 HTTP 200 判为业务成功。

## 验证与交付

- 对新增/改变行为按 [hai-app-tests](../hai-app-tests/SKILL.md) 写有意义的测试；目标用例先因行为缺失失败，既有回归保持通过。UI/路由改动覆盖真实流程、异步失败与权限路径；纯文案/文档按影响验证。
- 从当前 `package.json` 选择实际脚本，优先 workspace filter；按 `typecheck → lint → build（构建/配置/跨包变更）→ test → 相关 E2E` 验证，PowerShell 使用 `pnpm.cmd`。不能调用框架仓库私有命令替代应用检查。
- typecheck/lint 只覆盖部分质量规则；权限、事务、降级、真实 provider、浏览器、容器和原生交付各自需要适用行为证据。缺环境或密钥时报告未验证，不能用 mock 冒充真实集成。
- 完成说明：实际复用能力与自定义缺口、修改路径、已执行命令/行为结果、同步的 contract/调用方/配置/i18n/文档、未验证项及原因。无需无关模块的“覆盖率”清单。
