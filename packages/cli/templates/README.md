# CLI Templates

此目录包含 `hai create` 命令使用的项目模板文件。

## 目录结构

```
templates/
├── base/                    # 所有应用类型共用的骨架文件
│   ├── package.json.hbs     # 动态：按 features 注入依赖
│   ├── vite.config.ts.hbs   # 动态：按 hasI18n / hasUi 注入插件
│   ├── tsconfig.json.hbs    # 动态：SvelteKit / 纯 Svelte 5 分支
│   ├── svelte.config.js.hbs # 动态：SvelteKit / 纯 Svelte 5 分支
│   ├── .gitignore.hbs      # 动态：纯 Svelte 5 应用不输出 .svelte-kit
│   ├── playwright.config.ts
│   └── src/
│       ├── app.html.hbs         # 动态：SvelteKit 应用输出 app shell
│       ├── app.d.ts.hbs         # 动态：SvelteKit 应用输出 App namespace
│       ├── app.css
│       ├── hooks.server.ts.hbs  # 动态：按 features / hasI18n 组装 handle 序列
│       └── lib/server/
│           └── init.ts.hbs      # 动态：按 features 注入模块初始化
│
├── apps/                    # 应用类型专属路由与页面
│   ├── admin/               # 管理后台
│   │   ├── messages/        # i18n 消息文件（zh-CN / en-US）
│   │   └── src/routes/      # +page / +layout .svelte.hbs
│   ├── website/             # 企业官网
│   │   ├── messages/
│   │   └── src/routes/
│   ├── h5/                  # H5 移动端
│   │   ├── messages/
│   │   └── src/routes/
│   ├── api/                 # 纯 API 服务（无 UI / 无 i18n）
│   │   └── src/routes/
│   ├── mobile-app/          # Svelte 5 + Vite + Capacitor 移动应用
│   │   ├── index.html.hbs
│   │   ├── messages/
│   │   └── src/App.svelte.hbs
│   └── fullstack/           # 前后端分离多包工程（contract / serv / web / app / desktop / miniapp 占位）
│       ├── packages/        # 共享 contract 与后端 serv 包
│       ├── apps/            # 多前端目标，按用户选择条件生成
│       └── e2e/             # 服务端 + 页面级 Playwright 流程
│
├── features/                # 可选 feature 路由（叠加到 src/routes/）
│   ├── iam/
│   │   ├── routes-shared/   # 所有应用类型共用（API 端点）
│   │   ├── routes-admin/    # admin 专属（登录/注册页 .hbs）
│   │   └── routes-h5/       # h5 专属（登录/注册页 .hbs）
│   ├── storage/
│   │   └── routes/          # 上传 API
│   └── ai/
│       └── routes/          # 聊天流 API
│
├── i18n/                    # i18n 脚手架（hasI18n 时复制到项目根）
│   └── project.inlang/
│       └── settings.json    # Paraglide 项目配置
│
└── skills/                  # AI Skill 与各 appType 桥接指引
    └── bridges/             # admin / api / website / h5 / mobile-app / fullstack 专属 AGENTS
```

## AI Skill 模板（Single Source of Truth）

`templates/skills/` 是 CLI 生成共享 AI 上下文时的单一来源，同时用于 `hai create` 与 `hai add`。

- `hai create` 会把 `templates/skills/` 下所有 `hai-*` Skill 目录复制到 `.agents/skills/<skill>/`，再按 appType 排除互斥项（例如 fullstack 不复制 `hai-kit`；admin / website / h5 不复制 `hai-serv`、`hai-api-contract`、`hai-api-client`、`hai-capacitor`；mobile-app 不复制 `hai-core`、`hai-kit`、`hai-serv`、`hai-api-contract`）
- 通用 `copilot-instructions.md` 复制到 `.github/copilot-instructions.md`，只引用项目根 `AGENTS.md`，不另维护 appType 专属规则
- `bridges/<appType>/AGENTS.md` 会复制到项目根目录，确保不同样板工程使用自己的 AI 指引；通用 `CLAUDE.md` 仅包含 `@AGENTS.md`
- `opencode.json` 会复制到项目根目录
- `templates/skills/AGENTS.md` 是缺少 appType 上下文时的通用规则；`CLAUDE.md`、`copilot-instructions.md` 与 `opencode.json` 是各工具的轻量入口，用于创建项目和回填 AI 支持
- Codex 原生读取根 `AGENTS.md` 并发现 `.agents/skills/`，支持 `$hai-app-create` 等显式调用和按任务自动选择；无需 `.codex/skills` 或工具专属配置。依据：[Codex skills](https://learn.chatgpt.com/docs/build-skills)、[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- `opencode.json` 使用 OpenCode 的 `instructions` 配置直接引用 `AGENTS.md`；`.agents/skills/` 由 OpenCode 原生发现，不再写入过期的 `skills.paths`
- `CLAUDE.md` 通过 `@AGENTS.md` 复用共享规范，Claude Code 按其中的任务导航读取 `.agents/skills/` 正文与参考。CLI 不生成 `.claude/` 技能副本；此模式不提供 Claude 原生技能自动发现或 `/skill` 命令。依据：[Claude Code 项目指引](https://code.claude.com/docs/en/memory)、[原生 skills](https://code.claude.com/docs/en/skills)
- `hai add` / `hai init` 只补齐缺失的 AI 支持文件，不覆盖用户已自定义的桥接文件，也不会自动删除遗留的 `.github/skills/` 或 `.claude/`

## 文件类型说明

| 类型                                       | 处理方式                                     |
| ------------------------------------------ | -------------------------------------------- |
| 普通文件（`.ts` / `.svelte` / `.json` 等） | 直接复制，内容不变                           |
| `.hbs` 文件                                | 经 Handlebars 渲染后输出（去掉 `.hbs` 后缀） |

## 渲染上下文（TemplateContext）

所有 `.hbs` 文件可使用以下变量：

| 变量                   | 类型      | 说明                                      |
| ---------------------- | --------- | ----------------------------------------- |
| `{{projectName}}`      | `string`  | 项目名称（如 `my-app`）                   |
| `{{appType}}`          | `string`  | 应用类型                                  |
| `{{hasUi}}`            | `boolean` | 是否包含 UI（非 `api` 类型为 `true`）     |
| `{{hasI18n}}`          | `boolean` | 是否启用 i18n（非 `api` 类型为 `true`）   |
| `{{isSvelteOnlyApp}}`  | `boolean` | 是否为不依赖 SvelteKit 的纯 Svelte 5 应用 |
| `{{isCapacitorApp}}`   | `boolean` | 是否为 Capacitor 移动应用                 |
| `{{defaultLocale}}`    | `string`  | 默认语言，如 `zh-CN`                      |
| `{{packageManager}}`   | `string`  | 包管理器：`pnpm` / `npm` / `yarn`         |
| `{{fullstack.*}}`      | `object`  | fullstack 类型专用上下文                  |
| `{{features.iam}}`     | `boolean` | 是否选中 iam feature                      |
| `{{features.db}}`      | `boolean` | 是否选中 db feature                       |
| `{{features.cache}}`   | `boolean` | 是否选中 cache feature                    |
| `{{features.crypto}}`  | `boolean` | 是否选中 crypto feature                   |
| `{{features.storage}}` | `boolean` | 是否选中 storage feature                  |
| `{{features.ai}}`      | `boolean` | 是否选中 ai feature                       |

`appType` 支持 `admin` / `website` / `h5` / `api` / `mobile-app` / `fullstack`。

H5 业务页面复用 `@h-ai/ui` 的 `BottomNav` 和移动端壳样式，桌面预览保持居中限宽，认证路由独立显示。

`fullstack.*` 包含包名、前端选择、依赖版本、`contractExportName` 和原生壳 `nativeAppIdSegment`，用于渲染 contract / serv / 多端 UI / Capacitor / Tauri 模板。

`moduleConfigs` 保留创建时指定的模块值。Fullstack 的模块 YAML 用 `{{{moduleConfig 'db' true}}}` 等 helper 复用 `cli-config-templates.ts`；可选模块传 `features.ai` 等开关，未选择时整份注释。创建流程保留已渲染的配置，不再用精简内容覆盖；core、serv、Reach 保留应用专用默认值及完整的可选字段。新增 Schema 字段同步此生成器和相应模板。

所有根 `.gitignore`（base / api / fullstack）保留 `**/data/`，包括 `.gitkeep` 在内的运行数据不跟踪。Fullstack 服务端 config 始终含 core、serv、db、cache、iam、storage、audit、reach、ai、vecdb、payment、scheduler、deploy 共 13 份 YAML；不为无配置入口的 crypto/datapipe 生成 YAML。未启用块的后续接入步骤见 [CLI 配置说明](../README.md#应用配置与显示)。

### 常用条件写法

```handlebars
{{!-- 按 feature 条件注入内容 --}}
{{#if features.iam}}
import { iam } from '@h-ai/iam'
{{/if}}

{{!-- 按 i18n 条件切换内容 --}}
{{#if hasI18n}}
  <title>{m.page_title()}</title>
{{else}}
  <title>首页</title>
{{/if}}
```

## 生成流程

模板引擎执行 6 个步骤：

1. **复制 `base/` 静态文件** → 项目根
2. **复制 `apps/{appType}/` 专属文件** → 项目根（`messages/` 仅 `hasI18n` 时复制）
3. **叠加 feature 静态路由** → `src/routes/`（纯 Svelte 5 应用跳过 SvelteKit 路由）
4. **渲染所有 `.hbs` 文件** — `base/` + `apps/{appType}/` 输出到项目根；`features/*/routes*/` 输出到 `src/routes/`
5. **复制 `i18n/` 脚手架** → 项目根（仅 `hasI18n` 时）
6. **确保 `static/` 目录存在**

## 新增模板

### 新增应用页面

在 `apps/{appType}/src/routes/` 下创建 `.svelte` 或 `.svelte.hbs` 文件。若含用户可见文本，使用 `.hbs` 并加 `{{#if hasI18n}}` 条件，同时在对应的 `apps/{appType}/messages/` 里补充 i18n key。

### 新增 feature 路由

在 `features/{featureId}/routes-shared/`（API 路由）或 `features/{featureId}/routes-{appType}/`（UI 页面）下创建文件，然后在 `cli-template-engine.ts` 的 `FEATURE_ROUTE_DIRS` / `FEATURE_APP_ROUTE_DIRS` 中注册该目录。

## 配置驱动认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

选用 IAM 的 admin/h5/website 模板提供 AuthPanel 和标准认证路由；mobile-app 与 fullstack Web/App/Desktop 使用 API 客户端共享动作。修改服务端 config/_iam.yml 即可控制登录方式、注册、重置、协议和品牌，无需改表单。配置 Reach 模板和真实发送 Provider 后启用 OTP/重置。分布式部署使用共享数据库与 Redis。

LDAP/Reach 是可选 peer；IAM 不强制启用 Reach。默认 LDAP 客户端由应用选择安装 ldapts。自定义通知回调、协议弹窗、表单 snippet 用法随 hai-iam/hai-ui skills 完整复制到生成项目，不能要求应用读取本仓库私有路径。
