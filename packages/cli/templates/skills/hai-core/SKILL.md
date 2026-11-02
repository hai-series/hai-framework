---
name: hai-core
description: "配置 hai 应用启动、YAML/环境变量、日志、i18n 与 HaiResult；排查配置覆盖和错误本地化。"
---

# hai-core

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/core 配置、日志、i18n、ID、Zod 错误本地化和 HaiResult |
| 适用场景 | 启动配置、日志脱敏、国际化或公共错误处理 |
| 输入 | CoreOptions、YAML、环境变量、locale、日志上下文 |
| 输出 | core.init 为同步 void；配置校验为 HaiResult；工具返回直接值 |
| 限制 | core 无 close；浏览器不加载 YAML。配置日志需脱敏，ID 不能当作密钥。 |

## 使用路径

- Node 启动用 core.init({ configDir, configSchemas }) 加载配置；configSchemas 登记所用模块的公开 Schema，使 YAML 未声明的合法可选字段也能接收细项环境变量。勿传 logging 覆盖 _core.yml 中的日志设置，除非任务明确要求。
- 自动加载和监听配置目录内所有 YAML；监听支持原地保存、原子替换和删除后重建，失败通知错误并保留最近成功的缓存，取消监听同时清除待执行重载。项目根 `hai.json` 的 `build` / `deploy` 由 CLI 读取，不进入运行时配置。单项 load 返回失败时记日志并继续，必需配置须 validate 并检查 success；目录扫描、日志设置等异常仍可能传播。
- 应用名称、版本、环境、默认语言和日志设置统一从 `_core.yml` 经 core.config 获取，日志使用 core.logger；UI 不另维护硬编码副本。SvelteKit layout / fullstack app.info 仅下发公开字段白名单；独立 Vite mobile-app 在 Node 构建时解析并注入公开默认值，修改这些编译默认值需要重新构建。静态 Web 的公开 API 地址等通过 `runtime-config.js` 覆盖时无需重建镜像，原生包在复制静态资源前准备配置入口。浏览器不加载 YAML，不接收完整模块配置、密钥或日志脱敏上下文。
- `HAI_<配置名>_<路径>` 支持父 JSON 基础与细项覆盖，同源先父后子，高来源整段替换清除低来源细项。camelCase 不拆词，约定变量优先于显式插值；宿主显式提供 `configSchemas` 识别 YAML 缺少的可选路径，模块执行业务校验。
- 环境文件约定：`.env.example` 完整列出字段用途、默认值、枚举和范围；`.env` 为公共基础；`.env.dev`、`.env.test`、`.env.prod` 为公共环境覆盖，公共文件提交 Git。`.env.local` 为共享私有配置，`.env.<mode>.local` 为模式私有配置，均不提交 Git。优先级为进程环境 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML；Vite 在 Node 配置阶段调用 `core.config.loadEnvFiles({ mode, envDir })` 并检查 success 后注入进程，Node 入口复用 `run-node.mjs` 的结构合并，避免原生多 `--env-file` 遗留低来源细项。`core.init` 不自行读取 dotenv。
- 配置 getter 与 ID/logger 方法不是 HaiResult；validate/load 等须检查 success。
- 日志可用 `{ error }` 记录原生 Error；两端先规范化诊断再字段/URL 脱敏，配置 redact 路径仍生效。默认包含 passwordHash、passwd、secretKey 等实际凭据字段；异常文本清理显式凭据标签和 URL，不保证识别无标签秘密。原异常不变，错误子图循环/深度用固定标记；业务隐私仍由调用方清理或遮蔽整条路径。
- 初始化前创建的默认、模块与嵌套 child Logger 在后续输出中应用当前全局 logging；configure/setLevel 也作用于已有实例。create 的显式 level/format/context 优先，未指定项动态继承。浏览器 json/pretty 与附加 redact 路径实际生效，消息文本仍由调用方脱敏。
- 脱敏副本不执行自定义 toJSON，不保留类原型；普通对象和类实例仅复制自有可枚举数据属性，跳过访问器，Date/URL 转为 ISO/脱敏字符串。副本用于诊断，不作为原类实例使用；仍只选取必要字段并清理无标签秘密。
- `core.async.parallel` 的并发数必须为大于 0 的安全整数，非法值拒绝为 RangeError，任务不会执行；debounce/throttle 保留回调参数类型。deepMerge 只递归普通对象，数组/Date/集合/类实例以后值覆盖；groupBy 支持 constructor 等原型同名键。
- 多模块应用可把各模块的 start/close 函数交给 `core.module.createRuntime`，创建时不执行；调用返回对象的 start 依次初始化，close 反序释放，均须检查 success。README/入门示例按[使用文档与证据](../hai-app-create/collaboration.md#使用文档与证据)说明目的并添加关键步骤注释。
- Core 运行能力按 core.xx 使用；使用入门逐项覆盖初始化及全部子功能，分别给出用途和展示输入、输出的带注释示例。无返回值的调用说明执行后的变化，工厂展示返回对象的使用结果，正文不保留讨论或逐句答复旧文案的痕迹，按共享文档要求核对。ok/err 是现有跨模块共用的结果构造器，类型、Schema 和错误常量也独立导入；说明这些明确例外，不臆造 core 上的方法。
- 解释环境覆盖时用 app.port/HAI_APP_PORT 与 `${PORT:3000}` 的实际输入展示最终值；说明只有 YAML 中的表达式会被替换，空字符串是已设置的值，混合文本仍为字符串，字符串 Schema 可保留前导零，环境/JSON 字面值不再展开。

错误提示与诊断分离：HTTP/UI 边界用 core.error.toPublic，仅公开 i18n 安全消息及 error.traceId；重新翻译后用 core.error.formatMessage 保留关联。ToastContainer 默认只显示可读说明，自动将编号移入排查信息图标，展开后可查看、复制并提供给客户支持或开发人员。前后端日志传完整 Error 和操作上下文，使用同一 requestId/traceId 并脱敏；禁止只写通用错误标题，也不能把 cause/ext/SQL/绑定值直接返回用户。数据库日志保留安全的驱动错误码、消息和堆栈。

## 按需参考

真实客户端地址、每次请求的 IP/时间/路径策略、独立 YAML 及部署边界读取[请求访问控制](request-access.md)；执行工具只从 Node `core.access` 使用。

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- 错误码
- 常见模式
- 相关 Skills
- 浏览器侧使用

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。
